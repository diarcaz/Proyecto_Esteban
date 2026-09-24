import { Injectable, UnauthorizedException, ServiceUnavailableException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../persistence/prisma/prisma.service';
import { RedisService } from '../cache/redis.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh.dto';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { credentialVersion, matchesCredentialVersion } from './credential-version';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {}

  private async loginLockout<T>(operation: () => Promise<T>): Promise<T> {
    try { return await operation(); }
    catch { throw new ServiceUnavailableException('Login temporarily unavailable. Please try later.'); }
  }

  async login(dto: LoginDto) {
    const lockKey = `auth_login:${dto.email.toLowerCase()}`;
    const failedAttempts = await this.loginLockout(() => this.redisService.getFailedAttempts(lockKey, true));
    if (failedAttempts >= 5) {
      throw new UnauthorizedException('Account temporarily locked due to multiple failed login attempts. Please try again in 15 minutes.');
    }

    const user = await (this.prisma as any).user.findUnique({
      where: { email: dto.email },
      include: { assignments: true, propertyAccess: true, employeeAssignments: { where: { active: true, effectiveFrom: { lte: new Date() }, OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: new Date() } }] } } },
    });

    if (!user) {
      await this.loginLockout(() => this.redisService.incrementFailedAttempts(lockKey, 900, true));
      throw new UnauthorizedException('Invalid credentials');
    }

    const isMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isMatch) {
      const attempts = await this.loginLockout(() => this.redisService.incrementFailedAttempts(lockKey, 900, true));
      if (attempts >= 5) {
        throw new UnauthorizedException('Too many failed login attempts. Account temporarily locked for 15 minutes.');
      }
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User account is not active');
    }

    await this.loginLockout(() => this.redisService.resetFailedAttempts(lockKey, true));

    const tokenId = uuidv4();
    const tokens = await this.generateTokens(user, tokenId);

    await this.redisService.setRefreshToken(user.id, tokenId, tokens.refreshToken, 7 * 24 * 60 * 60);

    return {
      user: {
        id: user.id,
        email: user.email,
        employeeNumber: user.employeeNumber,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        companyId: user.companyId,
        permissions: user.permissions || [],
        propertyAccess: (user.propertyAccess || []).map((p: any) => ({ propertyId: p.propertyId, permissions: p.permissions || [] })),
        assignedLocationIds: [...new Set([...(user.assignments || []).map((a: any) => a.locationId), ...(user.employeeAssignments || []).map((a: any) => a.propertyId), ...(user.propertyAccess || []).map((a: any) => a.propertyId)])],
      },
      tokens,
    };
  }

  async refreshTokens(dto: RefreshTokenDto) {
    try {
      const secret = this.configService.get<string>('JWT_SECRET');
      if (!secret) {
        throw new Error('FATAL SECURITY ERROR: JWT_SECRET environment variable is missing or empty.');
      }
      const decoded = this.jwtService.verify(dto.refreshToken, { secret });
      const user = await this.prisma.user.findUnique({ where: { id: decoded.sub } });
      if (decoded.type !== 'refresh' || !user || user.status !== 'ACTIVE' || !matchesCredentialVersion(decoded.credentialVersion, secret, user)) {
        throw new UnauthorizedException('Session is no longer valid');
      }

      const savedToken = await this.redisService.getRefreshToken(decoded.sub, decoded.tokenId);
      if (!savedToken || savedToken !== dto.refreshToken) {
        throw new UnauthorizedException('Refresh token is invalid or has been revoked');
      }

      if (!await this.redisService.consumeRefreshToken(decoded.sub, decoded.tokenId, dto.refreshToken)) {
        throw new UnauthorizedException('Refresh token already used');
      }

      const newTokId = uuidv4();
      const tokens = await this.generateTokens(user, newTokId);
      await this.redisService.setRefreshToken(decoded.sub, newTokId, tokens.refreshToken, 7 * 24 * 60 * 60);

      return tokens;
    } catch (e: any) {
      if (e.message?.includes('FATAL SECURITY ERROR')) throw e;
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async logout(userId: string, tokenId: string) {
    await this.redisService.revokeRefreshToken(userId, tokenId);
    return { success: true, message: 'Logged out successfully' };
  }

  private async generateTokens(user: { id: string; email: string; role: string; passwordHash: string }, tokenId: string) {
    const secret = this.configService.get<string>('JWT_SECRET');
    if (!secret) throw new Error('FATAL SECURITY ERROR: JWT_SECRET required');
    const payload = { sub: user.id, email: user.email, role: user.role, tokenId, credentialVersion: credentialVersion(secret, user) };

    const accessToken = this.jwtService.sign({ ...payload, type: 'access' }, { expiresIn: '15m' });
    const refreshToken = this.jwtService.sign({ ...payload, type: 'refresh' }, { expiresIn: '7d' });

    return { accessToken, refreshToken };
  }
}

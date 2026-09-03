import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../persistence/prisma/prisma.service';
import { RedisService } from '../cache/redis.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh.dto';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
  ) {}

  async login(dto: LoginDto) {
    const lockKey = `auth_login:${dto.email.toLowerCase()}`;
    const failedAttempts = await this.redisService.getFailedAttempts(lockKey);
    if (failedAttempts >= 5) {
      throw new UnauthorizedException('Account temporarily locked due to multiple failed login attempts. Please try again in 15 minutes.');
    }

    const user = await (this.prisma as any).user.findUnique({
      where: { email: dto.email },
      include: { assignments: true },
    });

    if (!user) {
      await this.redisService.incrementFailedAttempts(lockKey, 900);
      throw new UnauthorizedException('Invalid credentials');
    }

    const isMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isMatch) {
      const attempts = await this.redisService.incrementFailedAttempts(lockKey, 900);
      if (attempts >= 5) {
        throw new UnauthorizedException('Too many failed login attempts. Account temporarily locked for 15 minutes.');
      }
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User account is not active');
    }

    await this.redisService.resetFailedAttempts(lockKey);

    const tokenId = uuidv4();
    const tokens = await this.generateTokens(user.id, user.email, user.role, tokenId);

    await this.redisService.setRefreshToken(user.id, tokenId, tokens.refreshToken, 7 * 24 * 60 * 60);

    return {
      user: {
        id: user.id,
        email: user.email,
        employeeNumber: user.employeeNumber,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        assignedLocationIds: (user.assignments || []).map((a: any) => a.locationId),
      },
      tokens,
    };
  }

  async refreshTokens(dto: RefreshTokenDto) {
    try {
      const decoded = this.jwtService.verify(dto.refreshToken, {
        secret: (process as any).env.JWT_SECRET || 'super-secret-enterprise-key',
      });

      const savedToken = await this.redisService.getRefreshToken(decoded.sub, decoded.tokenId);
      if (!savedToken || savedToken !== dto.refreshToken) {
        throw new UnauthorizedException('Refresh token is invalid or has been revoked');
      }

      await this.redisService.revokeRefreshToken(decoded.sub, decoded.tokenId);

      const newTokId = uuidv4();
      const tokens = await this.generateTokens(decoded.sub, decoded.email, decoded.role, newTokId);
      await this.redisService.setRefreshToken(decoded.sub, newTokId, tokens.refreshToken, 7 * 24 * 60 * 60);

      return tokens;
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async logout(userId: string, tokenId: string) {
    await this.redisService.revokeRefreshToken(userId, tokenId);
    return { success: true, message: 'Logged out successfully' };
  }

  private async generateTokens(userId: string, email: string, role: string, tokenId: string) {
    const payload = { sub: userId, email, role, tokenId };

    const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });

    return { accessToken, refreshToken };
  }
}

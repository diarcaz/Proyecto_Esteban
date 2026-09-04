import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../persistence/prisma/prisma.service';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  tokenId: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const secret = configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('FATAL SECURITY ERROR: JWT_SECRET environment variable is missing or empty.');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: JwtPayload) {
    const now = new Date();
    const user = await (this.prisma as any).user.findUnique({
      where: { id: payload.sub },
      include: {
        assignments: {
          select: { locationId: true },
        },
        employeeAssignments: {
          where: {
            active: true,
            effectiveFrom: { lte: now },
            OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: now } }],
          },
          select: { propertyId: true },
        },
        propertyAccess: {
          select: {
            propertyId: true,
            roleOverride: true,
            permissions: true,
          },
        },
      },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account inactive or user not found');
    }

    const legacyLocationIds = (user.assignments || []).map((a: any) => a.locationId);
    const activeEmpPropertyIds = (user.employeeAssignments || []).map((ea: any) => ea.propertyId);
    const assignedLocationIds = Array.from(new Set([...legacyLocationIds, ...activeEmpPropertyIds]));

    return {
      id: user.id,
      email: user.email,
      companyId: user.companyId || null,
      employeeNumber: user.employeeNumber,
      role: user.role,
      permissions: user.permissions || [],
      propertyAccess: user.propertyAccess || [],
      status: user.status,
      assignedLocationIds,
      tokenId: payload.tokenId,
    };
  }
}

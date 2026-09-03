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
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET', 'super-secret-enterprise-key'),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await (this.prisma as any).user.findUnique({
      where: { id: payload.sub },
      include: {
        assignments: {
          select: { locationId: true },
        },
        department: {
          include: {
            location: {
              select: { companyId: true },
            },
          },
        },
      },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account inactive or user not found');
    }

    const assignedLocationIds = (user.assignments || []).map((a: any) => a.locationId);
    const companyId = user.department?.location?.companyId || null;

    return {
      id: user.id,
      email: user.email,
      companyId,
      employeeNumber: user.employeeNumber,
      role: user.role,
      status: user.status,
      assignedLocationIds,
      tokenId: payload.tokenId,
    };
  }
}

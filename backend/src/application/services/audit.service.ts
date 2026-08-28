import { Injectable } from '@nestjs/common';
import { PrismaService } from '@infrastructure/persistence/prisma/prisma.service';

export interface CreateAuditLogDto {
  actorId: string;
  action: string;
  targetEntity?: string;
  details?: any;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async createAuditLog(dto: CreateAuditLogDto) {
    return this.prisma.auditLog.create({
      data: {
        actorId: dto.actorId,
        action: dto.action,
        targetEntity: dto.targetEntity,
        details: dto.details,
        ipAddress: dto.ipAddress,
        userAgent: dto.userAgent,
      },
    });
  }

  async getAuditLogs(query?: { ipAddress?: string; action?: string; limit?: number }) {
    const where: any = {};
    if (query?.ipAddress) {
      where.ipAddress = { contains: query.ipAddress };
    }
    if (query?.action) {
      where.action = query.action;
    }

    return this.prisma.auditLog.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
            employeeNumber: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: query?.limit || 50,
    });
  }
}

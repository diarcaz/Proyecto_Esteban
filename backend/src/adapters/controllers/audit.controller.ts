import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AuditService } from '@application/services/audit.service';
import { AuthGuard } from '@nestjs/passport';
import { RolesAndLocationsGuard } from '@adapters/guards/roles-and-locations.guard';
import { Roles } from '@adapters/decorators/roles-and-locations.decorator';
import { UserRole } from '@domain/entities/user.entity';

@Controller('api/v1/audit-logs')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'), RolesAndLocationsGuard)
  @Roles(UserRole.SUPER_ADMIN)
  async getAuditLogs(@Query('ip') ip?: string, @Query('action') action?: string, @Query('limit') limit?: string) {
    const logs = await this.auditService.getAuditLogs({
      ipAddress: ip,
      action,
      limit: limit ? parseInt(limit, 10) : 50,
    });

    return {
      success: true,
      total: logs.length,
      data: logs,
    };
  }
}

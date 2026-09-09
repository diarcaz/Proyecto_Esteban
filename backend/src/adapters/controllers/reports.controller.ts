import { Controller, Get, Query, Res, UseInterceptors, HttpCode, HttpStatus, Req, UseGuards, ForbiddenException } from '@nestjs/common';
import { Response } from 'express';
import { ReportsService } from '@application/services/reports.service';
import { PunchQueryDto } from '@adapters/dtos/attendance.dtos';
import { LocationIsolationInterceptor } from '@adapters/interceptors/location-isolation.interceptor';
import { Roles } from '@adapters/decorators/roles-and-locations.decorator';
import { UserRole } from '@domain/entities/user.entity';
import { TenantGuard } from '@adapters/guards/tenant.guard';
import { PermissionsGuard } from '@adapters/guards/permissions.guard';
import { RequirePermissions } from '@adapters/decorators/permissions.decorator';
import { Permission } from '@domain/permissions/permission.enum';

@Controller('api/v1/reports')
@UseGuards(TenantGuard, PermissionsGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('time-punches/pdf')
  @Roles(UserRole.SUPER_ADMIN, UserRole.LOCATION_ADMIN, UserRole.SUPERVISOR)
  @RequirePermissions(Permission.TIME_VIEW)
  @UseInterceptors(LocationIsolationInterceptor)
  @HttpCode(HttpStatus.OK)
  async downloadTimePunchesPdf(@Query() query: PunchQueryDto, @Req() req: any, @Res() res: Response) {
    const allowedLocationIds = req.query.allowed_location_ids as string[] | undefined;
    const pdfBuffer = await this.reportsService.buildTimePunchesPdfBuffer(query, allowedLocationIds);

    const filename = `Time_Punches_Report_${query.start_date || 'period'}.pdf`;

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': pdfBuffer.length,
    });

    return res.send(pdfBuffer);
  }

  @Get('payroll/excel')
  @Roles(UserRole.SUPER_ADMIN, UserRole.LOCATION_ADMIN)
  @RequirePermissions(Permission.VIEW_PAYROLL)
  @UseInterceptors(LocationIsolationInterceptor)
  @HttpCode(HttpStatus.OK)
  async downloadPayrollExcel(@Query() query: PunchQueryDto, @Req() req: any, @Res() res: Response) {
    const allowedLocationIds = req.query.allowed_location_ids as string[] | undefined;

    // Phase 3.2 (I): Pass currentUser for financial permission checking
    const excelBuffer = await this.reportsService.buildPayrollExcelBuffer(query, allowedLocationIds, req.user);

    const filename = `Payroll_Export_${query.start_date || 'period'}.csv`;

    res.set({
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': excelBuffer.length,
    });

    return res.send(excelBuffer);
  }
}

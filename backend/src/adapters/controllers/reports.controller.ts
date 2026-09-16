import { PeriodExportService } from '@application/services/period-export.service';
import { PeriodExportDto } from '@adapters/dtos/period-export.dto';
import { PropertyRead } from '@adapters/decorators/property-read.decorator';
import { Controller, Get, Query, Res, UseInterceptors, HttpCode, HttpStatus, HttpException, ServiceUnavailableException, Req, UseGuards, ForbiddenException } from '@nestjs/common';
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
  constructor(private readonly reportsService: ReportsService, private readonly periodExports: PeriodExportService) {}
  @Get('attendance/detail.csv')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER, UserRole.LOCATION_ADMIN, UserRole.SUPERVISOR)
  @PropertyRead(Permission.TIME_VIEW)
  @RequirePermissions(Permission.TIME_VIEW)
  async detail(@Query() query: PeriodExportDto, @Req() req: any, @Res() res: Response) {
    return this.periodCsv('detail',query,req,res);
  }
  @Get('attendance/summary.csv')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER, UserRole.LOCATION_ADMIN, UserRole.SUPERVISOR)
  @PropertyRead(Permission.TIME_VIEW)
  @RequirePermissions(Permission.TIME_VIEW)
  async summary(@Query() query: PeriodExportDto, @Req() req: any, @Res() res: Response) {
    return this.periodCsv('summary',query,req,res);
  }
  private async periodCsv(kind:'detail'|'summary',query:PeriodExportDto,req:any,res:Response) {
    try {
      const buffer=await this.periodExports.csv(kind,query,req.user,req.headers||{});
      res.set({'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="attendance-'+kind+'.csv"','Cache-Control':'no-store'});
      return res.send(buffer);
    } catch(error) {
      if(error instanceof HttpException) throw error;
      throw new ServiceUnavailableException('Period export unavailable. No partial export was returned.');
    }
  }


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

import { Controller, Get, Query, Res, UseGuards, UseInterceptors, HttpCode, HttpStatus, Req } from '@nestjs/common';
import { Response } from 'express';
import { ReportsService } from '@application/services/reports.service';
import { PunchQueryDto } from '@adapters/dtos/attendance.dtos';
import { AuthGuard } from '@nestjs/passport';
import { RolesAndLocationsGuard } from '@adapters/guards/roles-and-locations.guard';
import { LocationIsolationInterceptor } from '@adapters/interceptors/location-isolation.interceptor';
import { Roles } from '@adapters/decorators/roles-and-locations.decorator';
import { UserRole } from '@domain/entities/user.entity';

@Controller('api/v1/reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('time-punches/pdf')
  @UseGuards(AuthGuard('jwt'), RolesAndLocationsGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.LOCATION_ADMIN, UserRole.SUPERVISOR)
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
  @UseGuards(AuthGuard('jwt'), RolesAndLocationsGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.LOCATION_ADMIN)
  @UseInterceptors(LocationIsolationInterceptor)
  @HttpCode(HttpStatus.OK)
  async downloadPayrollExcel(@Query() query: PunchQueryDto, @Req() req: any, @Res() res: Response) {
    const allowedLocationIds = req.query.allowed_location_ids as string[] | undefined;
    const excelBuffer = await this.reportsService.buildPayrollExcelBuffer(query, allowedLocationIds);

    const filename = `Payroll_Export_${query.start_date || 'period'}.csv`;

    res.set({
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': excelBuffer.length,
    });

    return res.send(excelBuffer);
  }
}

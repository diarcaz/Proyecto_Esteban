import { PropertyRead } from '@adapters/decorators/property-read.decorator';
import { KioskClockDto, KioskStatusDto, KioskPinDto } from '@adapters/dtos/attendance.dtos';
import { Controller, Get, Post, Patch, Body, Param, Query, BadRequestException, NotFoundException, ForbiddenException, UnauthorizedException, Req, UseGuards, HttpException } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AttendanceService } from '../../application/services/attendance.service';
import { Roles } from '@adapters/decorators/roles-and-locations.decorator';
import { Public } from '@adapters/decorators/public.decorator';
import { UserRole } from '@domain/entities/user.entity';
import { assertLocationAccess } from '@infrastructure/auth/location-access.util';
import { TenantGuard } from '@adapters/guards/tenant.guard';
import { PermissionsGuard } from '@adapters/guards/permissions.guard';
import { RequirePermissions } from '@adapters/decorators/permissions.decorator';
import { Permission } from '@domain/permissions/permission.enum';

@ApiTags('Attendance')
@Controller('api/v1/attendance')
@UseGuards(TenantGuard, PermissionsGuard)
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Post('clock')
  @ApiOperation({ summary: 'Submit mobile/GPS attendance punch for authenticated user' })
  async clockPunch(@Body() body: any, @Req() req: any) {
    try {
      const userId = req.user.id;
      return await this.attendanceService.processStandardClock(userId, body);
    } catch (e: any) {
      if (e instanceof HttpException) throw e;
      throw new BadRequestException('Failed to record attendance punch');
    }
  }

  @Post('admin-clock')
  @Roles(UserRole.SUPER_ADMIN, UserRole.LOCATION_ADMIN)
  @ApiOperation({ summary: 'Submit proxy attendance punch on behalf of an employee' })
  async adminClockPunch(@Body() body: any, @Req() req: any) {
    try {
      if (!body.user_id) {
        throw new BadRequestException('Target employee user_id is required.');
      }
      if (body.location_id) {
        assertLocationAccess(req.user, body.location_id);
      }
      return await this.attendanceService.processStandardClock(body.user_id, body);
    } catch (e: any) {
      if (e instanceof HttpException) throw e;
      throw new BadRequestException('Failed to record proxy attendance punch');
    }
  }

  @Post('kiosk-identify')
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  async kioskIdentify(@Body() body: KioskPinDto, @Req() req: any) {
    try { return await this.attendanceService.identifyKioskPin(body, req.ip || req.socket?.remoteAddress); }
    catch (e: unknown) {
      if (e instanceof HttpException) throw e;
      throw new BadRequestException('Unable to verify PIN. Please contact your administrator.');
    }
  }

  @Post('kiosk-status')
  @Public()
  @Throttle({ default: { limit: 15, ttl: 60000 } })
  @ApiOperation({ summary: 'Evaluate kiosk employee status and allowed punch actions' })
  async kioskStatus(@Body() body: KioskStatusDto) {
    try {
      return await this.attendanceService.getKioskEmployeeStatus(body);
    } catch (e: any) {
      if (e instanceof HttpException) throw e;
      throw new BadRequestException('Failed to retrieve kiosk employee status');
    }
  }

  @Post('kiosk-clock')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Submit touchscreen PIN kiosk punch' })
  async kioskPunch(@Body() body: KioskClockDto) {
    try {
      return await this.attendanceService.processKioskClock(body);
    } catch (e: any) {
      if (e instanceof HttpException) throw e;
      throw new BadRequestException('Failed to record kiosk punch');
    }
  }

  @Get('punches')
  @PropertyRead(Permission.TIME_VIEW)
  @RequirePermissions(Permission.TIME_VIEW)
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER, UserRole.LOCATION_ADMIN, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Retrieve time punches log list with filters' })
  async getPunches(@Query() query: any, @Req() req: any) {
    try {
      return await this.attendanceService.getPunches(query || {}, req.user, req.headers || {});
    } catch (e: any) {
      if (e instanceof HttpException) throw e;
      throw new BadRequestException('Failed to retrieve time punches');
    }
  }

  @Patch('punch/:id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.LOCATION_ADMIN)
  @ApiOperation({ summary: 'Adjust attendance punch timestamps' })
  async adjustPunchTime(
    @Param('id') id: string,
    @Body() body: { actualIn?: string; actualOut?: string },
    @Req() req: any,
  ) {
    try {
      const ip = req.ip || req.socket.remoteAddress;
      return await this.attendanceService.adjustPunchTime(id, body, req.user, ip);
    } catch (e: any) {
      if (e instanceof NotFoundException || e instanceof ForbiddenException) throw e;
      throw new BadRequestException(`Failed to update attendance log ${id}`);
    }
  }

  @Patch('approve-overtime/:id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.LOCATION_ADMIN)
  @ApiOperation({ summary: 'Approve overtime shift' })
  async approveOvertime(@Param('id') id: string, @Req() req: any) {
    try {
      const ip = req.ip || req.socket.remoteAddress;
      return await this.attendanceService.approveOvertime(id, req.user, ip);
    } catch (e: any) {
      if (e instanceof NotFoundException || e instanceof ForbiddenException) throw e;
      throw new BadRequestException(`Failed to approve overtime for log ${id}`);
    }
  }
}

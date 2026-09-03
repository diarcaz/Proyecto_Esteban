import { Controller, Get, Post, Patch, Body, Param, Query, BadRequestException, NotFoundException, Req } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AttendanceService } from '../../application/services/attendance.service';
import { Roles } from '@adapters/decorators/roles-and-locations.decorator';
import { Public } from '@adapters/decorators/public.decorator';
import { UserRole } from '@domain/entities/user.entity';

@ApiTags('Attendance')
@Controller('api/v1/attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Post('clock')
  @ApiOperation({ summary: 'Submit mobile/GPS attendance punch' })
  async clockPunch(@Body() body: any) {
    try {
      return await this.attendanceService.processStandardClock(body.user_id, body);
    } catch (e: any) {
      throw new BadRequestException(e.message || 'Failed to record attendance punch');
    }
  }

  @Post('kiosk-clock')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Submit touchscreen PIN kiosk punch' })
  async kioskPunch(@Body() body: any) {
    try {
      return await this.attendanceService.processKioskClock(body);
    } catch (e: any) {
      throw new BadRequestException(e.message || 'Failed to record kiosk punch');
    }
  }

  @Get('punches')
  @Roles(UserRole.SUPER_ADMIN, UserRole.LOCATION_ADMIN, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Retrieve time punches log list with filters' })
  async getPunches(@Query() query: any, @Req() req: any) {
    try {
      const allowedLocationIds = req.query.allowed_location_ids as string[] | undefined;
      return await this.attendanceService.getPunches(query || {}, allowedLocationIds);
    } catch (e: any) {
      throw new BadRequestException(e.message || 'Failed to retrieve time punches');
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
      const actorId = req.user?.id || 'system';
      const ip = req.ip || req.headers['x-forwarded-for'];
      return await this.attendanceService.adjustPunchTime(id, body, actorId, ip);
    } catch (e: any) {
      if (e instanceof NotFoundException) throw e;
      throw new BadRequestException(e.message || `Failed to update attendance log ${id}`);
    }
  }

  @Patch('approve-overtime/:id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.LOCATION_ADMIN)
  @ApiOperation({ summary: 'Approve overtime shift' })
  async approveOvertime(@Param('id') id: string, @Req() req: any) {
    try {
      const actorId = req.user?.id || 'system';
      const ip = req.ip || req.headers['x-forwarded-for'];
      return await this.attendanceService.approveOvertime(id, actorId, ip);
    } catch (e: any) {
      if (e instanceof NotFoundException) throw e;
      throw new BadRequestException(e.message || `Failed to approve overtime for log ${id}`);
    }
  }
}

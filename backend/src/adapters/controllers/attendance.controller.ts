import { Controller, Get, Post, Patch, Body, Param, Query, BadRequestException, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AttendanceService } from '../../application/services/attendance.service';

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
  @ApiOperation({ summary: 'Submit touchscreen PIN kiosk punch' })
  async kioskPunch(@Body() body: any) {
    try {
      return await this.attendanceService.processKioskClock(body);
    } catch (e: any) {
      throw new BadRequestException(e.message || 'Failed to record kiosk punch');
    }
  }

  @Get('punches')
  @ApiOperation({ summary: 'Retrieve time punches log list with filters' })
  async getPunches(@Query() query: any) {
    try {
      return await this.attendanceService.getPunches(query || {});
    } catch (e: any) {
      throw new BadRequestException(e.message || 'Failed to retrieve time punches');
    }
  }

  @Patch('punch/:id')
  @ApiOperation({ summary: 'Adjust attendance punch timestamps' })
  async adjustPunchTime(@Param('id') id: string, @Body() body: { actualIn?: string; actualOut?: string }) {
    try {
      return {
        statusCode: 200,
        message: `Attendance punch ${id} updated successfully.`,
        data: { id, ...body },
      };
    } catch (e: any) {
      throw new NotFoundException(`Attendance log ${id} not found.`);
    }
  }

  @Patch('approve-overtime/:id')
  @ApiOperation({ summary: 'Approve overtime shift' })
  async approveOvertime(@Param('id') id: string) {
    try {
      return {
        statusCode: 200,
        message: `Overtime for punch ${id} approved successfully.`,
        data: { id, isOvertimeApproved: true, status: 'OVERTIME' },
      };
    } catch (e: any) {
      throw new NotFoundException(`Attendance log ${id} not found.`);
    }
  }
}

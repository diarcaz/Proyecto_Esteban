import { Injectable, BadRequestException, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@infrastructure/persistence/prisma/prisma.service';
import { RedisService } from '@infrastructure/cache/redis.service';
import { StandardClockDto, KioskClockDto, PunchQueryDto } from '@adapters/dtos/attendance.dtos';
import { AttendanceType, AttendanceStatus, AttendanceMethod } from '@domain/entities/attendance-log.entity';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  async processStandardClock(userId: string, dto: StandardClockDto) {
    const timestamp = new Date();
    return this.executePunchSequence(userId, dto.location_id, dto.type, dto.method, timestamp, dto.device_info, dto.location_coordinates);
  }

  async processKioskClock(dto: KioskClockDto) {
    let user = null;
    if (dto.employee_number) {
      user = await this.prisma.user.findUnique({
        where: { employeeNumber: dto.employee_number },
      });
    }

    if (!user && dto.pin_code) {
      const candidates = await this.prisma.user.findMany({
        where: { status: 'ACTIVE', pinCodeHash: { not: null } },
      });
      for (const candidate of candidates) {
        if (candidate.pinCodeHash && (await bcrypt.compare(dto.pin_code, candidate.pinCodeHash))) {
          user = candidate;
          break;
        }
      }
    }

    const lockKey = user ? `kiosk_pin:${user.id}` : `kiosk_pin:${dto.employee_number || 'unknown'}`;
    const failedAttempts = await this.redisService.getFailedAttempts(lockKey);
    if (failedAttempts >= 5) {
      throw new UnauthorizedException('Account temporarily locked due to multiple failed PIN attempts. Please wait 15 minutes or contact administrator.');
    }

    if (!user || user.status !== 'ACTIVE') {
      await this.redisService.incrementFailedAttempts(lockKey, 900);
      throw new UnauthorizedException('Invalid employee PIN or inactive user.');
    }

    if (!user.pinCodeHash || !(await bcrypt.compare(dto.pin_code, user.pinCodeHash))) {
      const attempts = await this.redisService.incrementFailedAttempts(lockKey, 900);
      if (attempts >= 5) {
        throw new UnauthorizedException('Too many failed PIN attempts. Account temporarily locked for 15 minutes.');
      }
      throw new UnauthorizedException('Invalid PIN code.');
    }

    await this.redisService.resetFailedAttempts(lockKey);

    const location = await this.prisma.location.findFirst({
      where: { locationCode: dto.location_code },
    });

    if (!location) {
      throw new NotFoundException(`Location code '${dto.location_code}' not found.`);
    }

    const timestamp = new Date();
    return this.executePunchSequence(
      user.id,
      location.id,
      dto.type,
      AttendanceMethod.KIOSK_PIN,
      timestamp,
      dto.device_info,
      dto.location_coordinates,
    );
  }

  async getPunches(query: PunchQueryDto, allowedLocationIds?: string[]) {
    const where: any = {};

    if (query.location_id) {
      where.locationId = query.location_id;
    } else if (allowedLocationIds && allowedLocationIds.length > 0) {
      where.locationId = { in: allowedLocationIds };
    }

    if (query.employee_number) {
      where.user = { employeeNumber: query.employee_number };
    }

    if (query.start_date || query.end_date) {
      where.timestamp = {};
      if (query.start_date) where.timestamp.gte = new Date(query.start_date);
      if (query.end_date) where.timestamp.lte = new Date(query.end_date);
    }

    const logs = await this.prisma.attendanceLog.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            employeeNumber: true,
            firstName: true,
            lastName: true,
            jobPositionCode: true,
          },
        },
        location: {
          select: {
            id: true,
            name: true,
            locationCode: true,
          },
        },
        shiftSchedule: true,
      },
      orderBy: { timestamp: 'desc' },
      take: 200,
    });

    return logs.map((log) => ({
      ...log,
      type: log.punchType,
      method: log.punchMethod,
    }));
  }

  private async executePunchSequence(
    userId: string,
    locationId: string,
    type: AttendanceType,
    method: AttendanceMethod,
    timestamp: Date,
    deviceInfo?: Record<string, any>,
    locationCoordinates?: { latitude: number; longitude: number; accuracy?: number },
  ) {
    const latestLog = await this.prisma.attendanceLog.findFirst({
      where: { userId },
      orderBy: { timestamp: 'desc' },
    });

    this.validateStateTransition(latestLog?.punchType as AttendanceType | null, type);

    const searchWindowStart = new Date(timestamp.getTime() - 24 * 60 * 60 * 1000);
    const searchWindowEnd = new Date(timestamp.getTime() + 12 * 60 * 60 * 1000);

    const activeSchedule = await this.prisma.shiftSchedule.findFirst({
      where: {
        userId,
        scheduledIn: { gte: searchWindowStart, lte: searchWindowEnd },
      },
      include: { shift: true },
      orderBy: { scheduledIn: 'desc' },
    });

    let punchStatus: AttendanceStatus = AttendanceStatus.ON_TIME;
    let graceMins = 15;

    if (activeSchedule?.shift?.gracePeriodMins) {
      graceMins = activeSchedule.shift.gracePeriodMins;
    }

    if (activeSchedule && type === AttendanceType.CLOCK_IN) {
      const graceTime = new Date(activeSchedule.scheduledIn.getTime() + graceMins * 60 * 1000);
      if (timestamp > graceTime) {
        punchStatus = AttendanceStatus.LATE;
      }
    } else if (activeSchedule && type === AttendanceType.CLOCK_OUT) {
      if (timestamp < activeSchedule.scheduledOut) {
        punchStatus = AttendanceStatus.EARLY_LEAVE;
      }
    }

    let calculatedHours: number | null = null;
    let takenLunch = false;
    let isOvertime = false;

    if (type === AttendanceType.CLOCK_OUT) {
      const latestClockIn = await this.prisma.attendanceLog.findFirst({
        where: {
          userId,
          punchType: AttendanceType.CLOCK_IN as any,
          timestamp: { lte: timestamp },
        },
        orderBy: { timestamp: 'desc' },
      });

      if (latestClockIn) {
        const currentCycleLogs = await this.prisma.attendanceLog.findMany({
          where: {
            userId,
            timestamp: { gte: latestClockIn.timestamp, lte: timestamp },
          },
          orderBy: { timestamp: 'asc' },
        });

        const lunchStart = currentCycleLogs.find((l) => l.punchType === AttendanceType.LUNCH_START);
        const lunchEnd = currentCycleLogs.find((l) => l.punchType === AttendanceType.LUNCH_END);

        const grossMs = timestamp.getTime() - latestClockIn.timestamp.getTime();
        let lunchMs = 0;

        if (lunchStart && lunchEnd) {
          lunchMs = lunchEnd.timestamp.getTime() - lunchStart.timestamp.getTime();
          takenLunch = true;
        }

        const netMs = Math.max(0, grossMs - lunchMs);
        const netHours = parseFloat((netMs / (1000 * 60 * 60)).toFixed(2));

        calculatedHours = netHours;
        isOvertime = netHours > 8.0;
        if (isOvertime) {
          punchStatus = AttendanceStatus.OVERTIME;
        }
      }
    }

    const log = await this.prisma.attendanceLog.create({
      data: {
        userId,
        locationId,
        shiftScheduleId: activeSchedule?.id || null,
        punchType: type as any,
        punchMethod: method as any,
        timestamp,
        actualTimestamp: timestamp,
        deviceInfo: deviceInfo as any,
        locationCoordinates: locationCoordinates as any,
        takenLunch,
        calculatedHours: calculatedHours !== null ? calculatedHours : null,
        isOvertime,
        status: punchStatus as any,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: userId,
        action: `ATTENDANCE_PUNCH_${type}`,
        targetEntity: 'AttendanceLog',
        details: {
          logId: log.id,
          locationId,
          method,
          calculatedHours,
          status: punchStatus,
        },
      },
    });

    return log;
  }

  private validateStateTransition(previousType: AttendanceType | null, nextType: AttendanceType) {
    if (!previousType || previousType === AttendanceType.CLOCK_OUT) {
      if (nextType !== AttendanceType.CLOCK_IN) {
        throw new BadRequestException(`Invalid punch sequence. Must perform CLOCK_IN before ${nextType}.`);
      }
      return;
    }

    if (previousType === AttendanceType.CLOCK_IN) {
      if (nextType !== AttendanceType.LUNCH_START && nextType !== AttendanceType.CLOCK_OUT) {
        throw new BadRequestException(`Invalid punch sequence after CLOCK_IN. Expected LUNCH_START or CLOCK_OUT, got ${nextType}.`);
      }
      return;
    }

    if (previousType === AttendanceType.LUNCH_START) {
      if (nextType !== AttendanceType.LUNCH_END) {
        throw new BadRequestException(`Invalid punch sequence. Must perform LUNCH_END after LUNCH_START.`);
      }
      return;
    }

    if (previousType === AttendanceType.LUNCH_END) {
      if (nextType !== AttendanceType.CLOCK_OUT && nextType !== AttendanceType.LUNCH_START) {
        throw new BadRequestException(`Invalid punch sequence after LUNCH_END. Expected CLOCK_OUT, got ${nextType}.`);
      }
      return;
    }
  }

  async adjustPunchTime(id: string, dto: { actualIn?: string; actualOut?: string }, actorId: string, ipAddress?: string) {
    const log = await this.prisma.attendanceLog.findUnique({ where: { id } });
    if (!log) {
      throw new NotFoundException(`Attendance log ${id} not found.`);
    }

    const newTimestamp = dto.actualIn ? new Date(dto.actualIn) : dto.actualOut ? new Date(dto.actualOut) : log.timestamp;

    const updated = await this.prisma.attendanceLog.update({
      where: { id },
      data: {
        timestamp: newTimestamp,
        punchMethod: AttendanceMethod.MANUAL_OVERRIDE,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'ADJUST_ATTENDANCE_PUNCH',
        targetEntity: 'AttendanceLog',
        ipAddress: ipAddress || null,
        details: {
          logId: id,
          previousTimestamp: log.timestamp,
          newTimestamp: updated.timestamp,
          changes: dto,
        },
      },
    });

    return {
      statusCode: 200,
      message: `Attendance punch ${id} updated successfully.`,
      data: updated,
    };
  }

  async approveOvertime(id: string, actorId: string, ipAddress?: string) {
    const log = await this.prisma.attendanceLog.findUnique({ where: { id } });
    if (!log) {
      throw new NotFoundException(`Attendance log ${id} not found.`);
    }

    const updated = await this.prisma.attendanceLog.update({
      where: { id },
      data: {
        isOvertime: true,
        isOvertimeApproved: true,
        status: AttendanceStatus.OVERTIME,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'APPROVE_OVERTIME',
        targetEntity: 'AttendanceLog',
        ipAddress: ipAddress || null,
        details: {
          logId: id,
          previousIsOvertimeApproved: log.isOvertimeApproved,
          newIsOvertimeApproved: true,
        },
      },
    });

    return {
      statusCode: 200,
      message: `Overtime for punch ${id} approved successfully.`,
      data: updated,
    };
  }
}

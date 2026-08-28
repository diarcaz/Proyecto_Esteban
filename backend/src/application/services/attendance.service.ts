import { Injectable, BadRequestException, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@infrastructure/persistence/prisma/prisma.service';
import { StandardClockDto, KioskClockDto, PunchQueryDto } from '@adapters/dtos/attendance.dtos';
import { AttendanceType, AttendanceStatus, AttendanceMethod } from '@domain/entities/attendance-log.entity';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

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
      user = await this.prisma.user.findFirst({
        where: { pinCode: dto.pin_code },
      });
    }

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Invalid employee PIN or inactive user.');
    }

    let isPinValid = false;
    if (user.pinCode && user.pinCode === dto.pin_code) {
      isPinValid = true;
    } else if (user.pinCodeHash) {
      isPinValid = await bcrypt.compare(dto.pin_code, user.pinCodeHash);
    }

    if (!isPinValid) {
      throw new UnauthorizedException('Invalid PIN code.');
    }

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

    const startOfDay = new Date(timestamp);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(timestamp);
    endOfDay.setHours(23, 59, 59, 999);

    const activeSchedule = await this.prisma.shiftSchedule.findFirst({
      where: {
        userId,
        scheduledIn: { gte: startOfDay, lte: endOfDay },
      },
      include: { shift: true },
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
      const currentCycleLogs = await this.prisma.attendanceLog.findMany({
        where: {
          userId,
          timestamp: { gte: startOfDay, lte: timestamp },
        },
        orderBy: { timestamp: 'asc' },
      });

      const clockIn = currentCycleLogs.find((l) => l.punchType === AttendanceType.CLOCK_IN);
      const lunchStart = currentCycleLogs.find((l) => l.punchType === AttendanceType.LUNCH_START);
      const lunchEnd = currentCycleLogs.find((l) => l.punchType === AttendanceType.LUNCH_END);

      if (clockIn) {
        const grossMs = timestamp.getTime() - clockIn.timestamp.getTime();
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
}

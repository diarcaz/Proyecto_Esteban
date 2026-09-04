import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@infrastructure/persistence/prisma/prisma.service';
import { AuthorizationService } from '@domain/security/authorization.service';
import { Permission } from '@domain/permissions/permission.enum';
import { AttendanceType, AttendanceStatus, AttendanceMethod } from '@domain/entities/attendance-log.entity';

@Injectable()
export class WorkShiftService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authzService: AuthorizationService,
  ) {}

  /**
   * Core Punch Sequence Engine.
   * Handles CLOCK_IN, LUNCH_START, LUNCH_END, CLOCK_OUT punches with:
   * - Atomic Prisma transactions
   * - Idempotency & double-submission protection
   * - Active EmployeeAssignment & RateConfiguration snapshot at clock-in
   * - State machine punch sequence validation
   * - Max shift duration detection (flags MISSED_CLOCK_OUT without fabricating fake punches)
   * - Overnight shift support
   */
  async processPunchSequence(
    userId: string,
    locationId: string,
    type: AttendanceType,
    method: AttendanceMethod,
    timestamp: Date,
    deviceInfo?: Record<string, any>,
    locationCoordinates?: { latitude: number; longitude: number; accuracy?: number },
  ) {
    // 1. Verify property assignment invariant
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, employeeNumber: true, firstName: true, lastName: true },
    });
    if (!user) throw new NotFoundException(`User ${userId} not found.`);

    if (user.role !== 'SUPER_ADMIN') {
      const isAssignedLoc = await this.prisma.userLocationAssignment.findFirst({
        where: { userId, locationId },
      });
      const isAssignedEmp = await this.prisma.employeeAssignment.findFirst({
        where: {
          userId,
          propertyId: locationId,
          active: true,
          effectiveFrom: { lte: timestamp },
          OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: timestamp } }],
        },
      });

      if (!isAssignedLoc && !isAssignedEmp) {
        throw new ForbiddenException(
          `Access denied: Employee ${user.employeeNumber} (${user.firstName} ${user.lastName}) has no active assignment to property '${locationId}'. Clock operation denied.`,
        );
      }
    }

    // 2. Fetch operational configuration for max shift duration limit
    const config = await this.prisma.propertyOperationalConfig.findUnique({
      where: { locationId },
    });
    const maxShiftMins = config?.maxShiftDurationMinutes || 960; // default 16 hours

    return await this.prisma.$transaction(async (tx) => {
      // 3. Check for existing open shift and detect missed clock-outs if max duration exceeded
      let openShift = await tx.workShift.findFirst({
        where: { userId, status: 'OPEN' },
        orderBy: { clockInTimestamp: 'desc' },
      });

      if (openShift) {
        const elapsedMins = (timestamp.getTime() - openShift.clockInTimestamp.getTime()) / (1000 * 60);
        if (elapsedMins > maxShiftMins) {
          // Flag open shift as MISSED_CLOCK_OUT without fabricating a fake CLOCK_OUT punch
          await tx.workShift.update({
            where: { id: openShift.id },
            data: { status: 'MISSED_CLOCK_OUT' },
          });

          await tx.auditLog.create({
            data: {
              actorId: userId,
              action: 'MISSED_CLOCK_OUT_DETECTED',
              targetEntity: `WorkShift:${openShift.id}`,
              details: {
                workShiftId: openShift.id,
                locationId,
                elapsedMinutes: Math.round(elapsedMins),
                maxShiftDurationMinutes: maxShiftMins,
              },
            },
          });

          openShift = null; // Shift is now closed as MISSED_CLOCK_OUT
        }
      }

      // 4. Handle CLOCK_IN
      if (type === AttendanceType.CLOCK_IN) {
        if (openShift) {
          throw new BadRequestException('Invalid punch sequence. Employee already has an open work shift. Perform CLOCK_OUT first.');
        }

        // Idempotency check: prevent duplicate CLOCK_IN within 5 seconds
        const recentShift = await tx.workShift.findFirst({
          where: {
            userId,
            clockInTimestamp: { gte: new Date(timestamp.getTime() - 5000) },
          },
        });
        if (recentShift) {
          const recentLog = await tx.attendanceLog.findFirst({
            where: { workShiftId: recentShift.id, punchType: AttendanceType.CLOCK_IN as any },
          });
          return { shift: recentShift, log: recentLog };
        }

        // Resolve active EmployeeAssignment
        const assignment = await tx.employeeAssignment.findFirst({
          where: {
            userId,
            propertyId: locationId,
            active: true,
            effectiveFrom: { lte: timestamp },
            OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: timestamp } }],
          },
        });

        // Resolve RateConfiguration effective at clockIn timestamp
        let rateConfig: any = null;
        if (assignment?.positionId) {
          rateConfig = await tx.rateConfiguration.findFirst({
            where: {
              positionId: assignment.positionId,
              effectiveFrom: { lte: timestamp },
              OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: timestamp } }],
            },
            orderBy: { effectiveFrom: 'desc' },
          });
        }

        // Create new WorkShift
        const newShift = await tx.workShift.create({
          data: {
            userId,
            locationId,
            departmentId: assignment?.departmentId || null,
            positionId: assignment?.positionId || null,
            employeeAssignmentId: assignment?.id || null,
            rateConfigurationId: rateConfig?.id || null,
            clockInTimestamp: timestamp,
            effectiveClockIn: timestamp,
            payRateApplied: rateConfig?.payRate || null,
            billRateApplied: rateConfig?.billRate || null,
            otPayRateApplied: rateConfig?.otPayRate || null,
            otBillRateApplied: rateConfig?.otBillRate || null,
            status: 'OPEN',
          },
        });

        // Create AttendanceLog
        const log = await tx.attendanceLog.create({
          data: {
            userId,
            locationId,
            workShiftId: newShift.id,
            punchType: type as any,
            punchMethod: method as any,
            timestamp,
            actualTimestamp: timestamp,
            effectiveTimestamp: timestamp,
            deviceInfo: deviceInfo as any,
            locationCoordinates: locationCoordinates as any,
            status: AttendanceStatus.ON_TIME,
          },
        });

        return { shift: newShift, log };
      }

      // 5. Handle LUNCH_START, LUNCH_END, CLOCK_OUT
      if (!openShift) {
        throw new BadRequestException(`Invalid punch sequence. Cannot perform ${type} without an open work shift.`);
      }

      // Fetch logs for open shift state machine validation
      const shiftLogs = await tx.attendanceLog.findMany({
        where: { workShiftId: openShift.id },
        orderBy: { timestamp: 'asc' },
      });
      const lastLog = shiftLogs[shiftLogs.length - 1];

      if (type === AttendanceType.LUNCH_START || type === AttendanceType.LUNCH2_START) {
        if (lastLog?.punchType === AttendanceType.LUNCH_START || lastLog?.punchType === AttendanceType.LUNCH2_START) {
          throw new BadRequestException(`Invalid punch sequence. Already on lunch break.`);
        }
      }

      if (type === AttendanceType.LUNCH_END || type === AttendanceType.LUNCH2_END) {
        if (
          !lastLog ||
          (lastLog.punchType !== AttendanceType.LUNCH_START && lastLog.punchType !== AttendanceType.LUNCH2_START)
        ) {
          throw new BadRequestException(`Invalid punch sequence. Must perform LUNCH_START before ${type}.`);
        }
      }

      if (type === AttendanceType.CLOCK_OUT) {
        if (lastLog?.punchType === AttendanceType.LUNCH_START || lastLog?.punchType === AttendanceType.LUNCH2_START) {
          throw new BadRequestException(`Invalid punch sequence. Must perform LUNCH_END before CLOCK_OUT.`);
        }
      }

      // Create punch AttendanceLog
      const log = await tx.attendanceLog.create({
        data: {
          userId,
          locationId,
          workShiftId: openShift.id,
          punchType: type as any,
          punchMethod: method as any,
          timestamp,
          actualTimestamp: timestamp,
          effectiveTimestamp: timestamp,
          deviceInfo: deviceInfo as any,
          locationCoordinates: locationCoordinates as any,
          status: AttendanceStatus.ON_TIME,
        },
      });

      // Update WorkShift state on CLOCK_OUT
      if (type === AttendanceType.CLOCK_OUT) {
        const allLogs = [...shiftLogs, log];
        const grossMins = Math.max(0, Math.round((timestamp.getTime() - openShift.effectiveClockIn!.getTime()) / (1000 * 60)));

        // Calculate break minutes
        let breakMins = 0;
        const lunch1Start = allLogs.find((l) => l.punchType === AttendanceType.LUNCH_START);
        const lunch1End = allLogs.find((l) => l.punchType === AttendanceType.LUNCH_END);
        if (lunch1Start && lunch1End) {
          breakMins += Math.max(0, Math.round((lunch1End.timestamp.getTime() - lunch1Start.timestamp.getTime()) / (1000 * 60)));
        }

        const workedMins = Math.max(0, grossMins - breakMins);
        const regularMins = Math.min(workedMins, 480); // 8 hours regular
        const overtimeMins = Math.max(0, workedMins - 480);

        const updatedShift = await tx.workShift.update({
          where: { id: openShift.id },
          data: {
            clockOutTimestamp: timestamp,
            effectiveClockOut: timestamp,
            regularMinutes: regularMins,
            overtimeMinutes: overtimeMins,
            status: 'COMPLETED',
          },
        });

        return { shift: updatedShift, log };
      }

      return { shift: openShift, log };
    });
  }

  /**
   * Scans for open shifts exceeding property maxShiftDurationMinutes and marks them as MISSED_CLOCK_OUT.
   */
  async checkMissedClockOuts(locationId?: string) {
    const now = new Date();
    const where: any = { status: 'OPEN' };
    if (locationId) where.locationId = locationId;

    const openShifts = await this.prisma.workShift.findMany({
      where,
      include: { location: { include: { operationalConfig: true } } },
    });

    const flagged: string[] = [];
    for (const shift of openShifts) {
      const maxMins = shift.location?.operationalConfig?.maxShiftDurationMinutes || 960;
      const elapsedMins = (now.getTime() - shift.clockInTimestamp.getTime()) / (1000 * 60);
      if (elapsedMins > maxMins) {
        await this.prisma.workShift.update({
          where: { id: shift.id },
          data: { status: 'MISSED_CLOCK_OUT' },
        });

        await this.prisma.auditLog.create({
          data: {
            actorId: shift.userId,
            action: 'MISSED_CLOCK_OUT_DETECTED',
            targetEntity: `WorkShift:${shift.id}`,
            details: {
              workShiftId: shift.id,
              locationId: shift.locationId,
              elapsedMinutes: Math.round(elapsedMins),
              maxShiftDurationMinutes: maxMins,
            },
          },
        });
        flagged.push(shift.id);
      }
    }
    return flagged;
  }

  /**
   * Queries WorkShifts with company and property isolation + financial field masking.
   */
  async getShifts(currentUser: any, query: any) {
    const where: any = {};

    if (currentUser && currentUser.role !== 'SUPER_ADMIN') {
      where.location = { companyId: currentUser.companyId };
    }

    if (query.locationId) {
      this.authzService.assertPropertyAccess(currentUser, query.locationId);
      where.locationId = query.locationId;
    } else if (currentUser && currentUser.role !== 'SUPER_ADMIN' && currentUser.role !== 'OWNER' && currentUser.role !== 'CLIENT_ADMIN') {
      const assigned = currentUser.assignedLocationIds || [];
      where.locationId = { in: assigned.length > 0 ? assigned : ['none'] };
    }

    if (query.userId) where.userId = query.userId;
    if (query.status) where.status = query.status;

    const shifts = await this.prisma.workShift.findMany({
      where,
      include: {
        user: { select: { id: true, employeeNumber: true, firstName: true, lastName: true } },
        location: { select: { id: true, name: true, locationCode: true } },
        department: { select: { id: true, name: true, deptCode: true } },
        position: { select: { id: true, title: true, code: true } },
        logs: { orderBy: { timestamp: 'asc' } },
        timeCorrections: true,
      },
      orderBy: { clockInTimestamp: 'desc' },
      take: 100,
    });

    return shifts.map((s) => this.authzService.maskFinancialFields(s, currentUser, s.locationId));
  }

  async getShiftById(id: string, currentUser: any) {
    const shift = await this.prisma.workShift.findUnique({
      where: { id },
      include: {
        location: { select: { id: true, companyId: true } },
        user: { select: { id: true, employeeNumber: true, firstName: true, lastName: true } },
        department: { select: { id: true, name: true, deptCode: true } },
        position: { select: { id: true, title: true, code: true } },
        logs: { orderBy: { timestamp: 'asc' } },
        timeCorrections: true,
      },
    });
    if (!shift) throw new NotFoundException(`WorkShift ${id} not found.`);

    const companyId = shift.location?.companyId;
    if (currentUser && companyId) {
      this.authzService.assertCompanyAccess(currentUser, companyId);
      this.authzService.assertPropertyAccess(currentUser, shift.locationId, companyId);
    }

    return this.authzService.maskFinancialFields(shift, currentUser, shift.locationId);
  }
}

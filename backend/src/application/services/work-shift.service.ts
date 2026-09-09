import { resolveEmployeeClockAssignment } from './employee-clock-context';
import { evaluateShiftState } from './shift-state';
import { Injectable, BadRequestException, ForbiddenException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '@infrastructure/persistence/prisma/prisma.service';
import { AuthorizationService } from '@domain/security/authorization.service';
import { Permission } from '@domain/permissions/permission.enum';
import { AttendanceType, AttendanceStatus, AttendanceMethod } from '@domain/entities/attendance-log.entity';
import { calculateShiftWorkedMinutes } from './time-correction.service';

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
   *
   * Phase 3.2 additions:
   * - Employee assignment ambiguity detection (G)
   * - Pinned rate / position consistency validation (G)
   * - Canonical lunch-adjusted shift calculation (H)
   * - No hardcoded 480-minute overtime threshold (H)
   * - Production row-lock errors are NOT silently swallowed (L)
   * - P2002 duplicate-open conflicts produce controlled errors (L)
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
    try {
      return await this.prisma.$transaction(async (tx) => {
        // A real transaction must acquire the employee row lock; no error-code fallback.
        if (typeof tx.$queryRaw !== 'function') throw new BadRequestException('Concurrency lock unavailable. Please retry.');
        try {
          await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
        } catch {
          throw new BadRequestException('Concurrency lock failed. Transaction aborted. Please retry.');
        }
        const user = await tx.user.findUnique({ where: { id: userId } });
        if (!user || user.status !== 'ACTIVE') throw new ForbiddenException('Employee is not eligible to clock.');
        const assignment = await resolveEmployeeClockAssignment(tx, userId, locationId, timestamp);
        let openShift = await tx.workShift.findFirst({ where: { userId, status: 'OPEN' }, orderBy: { clockInTimestamp: 'desc' } });
        const shiftLogs = openShift ? await tx.attendanceLog.findMany({ where: { workShiftId: openShift.id }, orderBy: { timestamp: 'asc' } }) : [];
        const config = openShift ? await tx.propertyOperationalConfig.findUnique({ where: { locationId: openShift.locationId } }) : null;
        const state = evaluateShiftState(userId, locationId, openShift, shiftLogs, timestamp, config?.maxShiftDurationMinutes ?? 960);
        if (!state.allowedActions.includes(type)) throw new BadRequestException('Invalid punch sequence. Requested action is not allowed for the current shift.');
        if (openShift && state.isOverdue) {
          await tx.workShift.update({ where: { id: openShift.id }, data: { status: 'MISSED_CLOCK_OUT' } });
          await tx.auditLog.create({ data: { actorId: userId, action: 'MISSED_CLOCK_OUT_DETECTED', targetEntity: `WorkShift:${openShift.id}`, details: { workShiftId: openShift.id, locationId: openShift.locationId } } });
          openShift = null;
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
              locationId,
              clockInTimestamp: { gte: new Date(timestamp.getTime() - 5000) },
            },
          });
          if (recentShift) {
            const recentLog = await tx.attendanceLog.findFirst({
              where: { workShiftId: recentShift.id, punchType: AttendanceType.CLOCK_IN as any },
            });
            return { shift: recentShift, log: recentLog };
          }

          // Resolve RateConfiguration with strict precedence rules
          let rateConfig: any = null;

          if (assignment?.rateConfigurationId) {
            // Pinned RateConfiguration scenario
            const pinnedRate = await tx.rateConfiguration.findUnique({
              where: { id: assignment.rateConfigurationId },
            });
            if (pinnedRate) {
              // Phase 3.2 (G): Verify pinned rate belongs to the assignment's position
              if (assignment.positionId && pinnedRate.positionId !== assignment.positionId) {
                throw new BadRequestException(
                  `Configuration ambiguity: Pinned RateConfiguration '${assignment.rateConfigurationId}' belongs to position '${pinnedRate.positionId}' but EmployeeAssignment position is '${assignment.positionId}'.`,
                );
              }

              const isEffectiveFromValid = new Date(pinnedRate.effectiveFrom) <= timestamp;
              const isEffectiveUntilValid = !pinnedRate.effectiveUntil || new Date(pinnedRate.effectiveUntil) >= timestamp;
              if (isEffectiveFromValid && isEffectiveUntilValid) {
                rateConfig = pinnedRate;
              } else {
                // Pinned rate exists but is expired: DO NOT silently use expired rate, DO NOT silently fall back to position rate
                await tx.auditLog.create({
                  data: {
                    actorId: userId,
                    action: 'EXPIRED_PINNED_RATE_CONFIG_DETECTED',
                    targetEntity: `EmployeeAssignment:${assignment.id}`,
                    details: {
                      rateConfigurationId: assignment.rateConfigurationId,
                      effectiveFrom: pinnedRate.effectiveFrom,
                      effectiveUntil: pinnedRate.effectiveUntil,
                      timestamp,
                    },
                  },
                });
                rateConfig = null;
              }
            }
          } else if (assignment?.positionId) {
            // Inherited Position RateConfiguration scenario
            const matchingRates = await tx.rateConfiguration.findMany({
              where: {
                positionId: assignment.positionId,
                effectiveFrom: { lte: timestamp },
                OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: timestamp } }],
              },
            });

            if (matchingRates.length > 1) {
              throw new BadRequestException(
                `Configuration ambiguity: Overlapping active RateConfigurations (${matchingRates.length}) found for position '${assignment.positionId}' at timestamp ${timestamp.toISOString()}.`,
              );
            } else if (matchingRates.length === 1) {
              rateConfig = matchingRates[0];
            }
          }

          // Create new WorkShift with complete financial snapshot
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
              payRateApplied: rateConfig?.payRate ?? null,
              billRateApplied: rateConfig?.billRate ?? null,
              otPayRateApplied: rateConfig?.otPayRate ?? null,
              otBillRateApplied: rateConfig?.otBillRate ?? null,
              markupTypeApplied: rateConfig?.markupType ?? null,
              markupValueApplied: rateConfig?.markupValue ?? null,
              minimumShiftMinsApplied: rateConfig?.minimumShiftMins ?? null,
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

          // Phase 3.2 (H): Use canonical calculation with lunch deduction, no hardcoded OT threshold
          const { workedMinutes } = calculateShiftWorkedMinutes(
            openShift.effectiveClockIn!,
            timestamp,
            allLogs,
          );

          const updatedShift = await tx.workShift.update({
            where: { id: openShift.id },
            data: {
              clockOutTimestamp: timestamp,
              effectiveClockOut: timestamp,
              regularMinutes: workedMinutes,
              overtimeMinutes: 0,
              status: 'COMPLETED',
            },
          });

          return { shift: updatedShift, log };
        }

        return { shift: openShift, log };
      });
    } catch (error: any) {
      // Phase 3.2 (L): Handle P2002 unique constraint violations cleanly
      if (error?.code === 'P2002') {
        throw new BadRequestException(
          `Conflict: Employee '${userId}' already has an open work shift. Duplicate OPEN shift creation denied by database constraint.`,
        );
      }
      throw error;
    }
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
   * Pure non-mutating idempotent query for WorkShifts.
   * Dynamically surfaces isOverdue and effectiveDisplayStatus without mutating database.
   */
  async getShifts(currentUser: any, query: any) {
    const where: any = {};

    if (currentUser && currentUser.role !== 'SUPER_ADMIN') {
      where.location = { companyId: currentUser.companyId };
    }

    if (query.locationId) {
      const prop = await this.prisma.location.findUnique({
        where: { id: query.locationId },
        select: { id: true, companyId: true },
      });
      if (!prop) {
        throw new NotFoundException(`Property '${query.locationId}' not found.`);
      }
      this.authzService.assertPropertyAccess(currentUser, query.locationId, prop.companyId);
      where.locationId = query.locationId;
    } else if (currentUser && currentUser.role !== 'SUPER_ADMIN' && currentUser.role !== 'OWNER') {
      const assigned = currentUser.assignedLocationIds || [];
      where.locationId = { in: assigned.length > 0 ? assigned : ['none'] };
    }

    if (query.userId) where.userId = query.userId;
    if (query.status) where.status = query.status;

    const shifts = await this.prisma.workShift.findMany({
      where,
      include: {
        user: { select: { id: true, employeeNumber: true, firstName: true, lastName: true } },
        location: { select: { id: true, name: true, locationCode: true, operationalConfig: true, companyId: true } },
        department: { select: { id: true, name: true, deptCode: true } },
        position: { select: { id: true, title: true, code: true } },
        logs: { orderBy: { timestamp: 'asc' } },
        timeCorrections: true,
      },
      orderBy: { clockInTimestamp: 'desc' },
      take: 100,
    });

    const now = new Date();
    return shifts.map((s) => {
      const masked: any = this.authzService.maskFinancialFields(s, currentUser, s.locationId, s.location?.companyId);
      const maxMins = s.location?.operationalConfig?.maxShiftDurationMinutes || 960;
      const elapsedMins = (now.getTime() - new Date(s.clockInTimestamp).getTime()) / (1000 * 60);
      const isOverdue = s.status === 'OPEN' && elapsedMins > maxMins;

      return {
        ...masked,
        isOverdue,
        effectiveDisplayStatus: isOverdue ? 'MISSED_CLOCK_OUT' : s.status,
      };
    });
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

    return this.authzService.maskFinancialFields(shift, currentUser, shift.locationId, companyId);
  }

  /**
   * Evaluates employee active shift state for Kiosk status screen without mutating any data.
   * Pure read-only method complying with Phase 4 Constraint 4:
   * - Does NOT silently modify WorkShift or AttendanceLog
   * - AttendanceLog remains immutable
   * - Never fabricates punches
   * - Exposes ZERO financial fields
   */
  async getEmployeeShiftState(userId: string, locationId: string, timestamp: Date = new Date()) {
    const openShift = await this.prisma.workShift.findFirst({
      where: { userId, status: 'OPEN' },
      include: {
        location: {
          select: {
            id: true,
            name: true,
            locationCode: true,
            timezone: true,
            operationalConfig: true,
          },
        },
        department: { select: { id: true, name: true, deptCode: true } },
        position: { select: { id: true, title: true, code: true } },
        logs: { orderBy: { timestamp: 'asc' } },
      },
      orderBy: { clockInTimestamp: 'desc' },
    });

    if (!openShift) {
      const lastShift = await this.prisma.workShift.findFirst({
        where: { userId, locationId },
        include: {
          logs: { orderBy: { timestamp: 'desc' }, take: 1 },
        },
        orderBy: { clockInTimestamp: 'desc' },
      });

      const lastLog = lastShift?.logs?.[0];

      return {
        hasActiveShift: false,
        currentStatus: 'CLOCKED_OUT' as const,
        activeShift: null,
        lastPunch: lastLog
          ? {
              type: lastLog.punchType,
              timestamp: lastLog.timestamp,
            }
          : null,
        allowedActions: evaluateShiftState(userId, locationId, null, [], timestamp).allowedActions,
        serverTime: timestamp.toISOString(),
      };
    }

    const logs = openShift.logs || [];
    const lastLog = logs[logs.length - 1];
    const lastPunchType = lastLog?.punchType || AttendanceType.CLOCK_IN;
    const config = openShift.location?.operationalConfig ?? await this.prisma.propertyOperationalConfig.findUnique({ where: { locationId: openShift.locationId } });
    const { isOverdue, currentStatus, allowedActions } = evaluateShiftState(userId, locationId, openShift, logs, timestamp, config?.maxShiftDurationMinutes ?? 960);

    return {
      hasActiveShift: true,
      currentStatus,
      activeShift: {
        id: openShift.id,
        clockInTimestamp: openShift.clockInTimestamp,
        department: openShift.department ? { id: openShift.department.id, name: openShift.department.name } : null,
        position: openShift.position ? { id: openShift.position.id, title: openShift.position.title } : null,
        isOverdue,
        lastPunchType,
        lastPunchTimestamp: lastLog?.timestamp || openShift.clockInTimestamp,
      },
      lastPunch: lastLog
        ? {
            type: lastLog.punchType,
            timestamp: lastLog.timestamp,
          }
        : null,
      allowedActions,
      serverTime: timestamp.toISOString(),
    };
  }

  /**
   * Helper function for deterministic rounded time calculations without mutating raw or effective shift fields.
   */
  calculateRoundedTimestamp(timestamp: Date, rule?: { roundingMinutes?: number; direction?: 'NEAREST' | 'UP' | 'DOWN' }): Date {
    const roundMins = rule?.roundingMinutes || 5;
    const direction = rule?.direction || 'NEAREST';
    const ms = 1000 * 60 * roundMins;
    const time = timestamp.getTime();

    let roundedTime: number;
    if (direction === 'UP') {
      roundedTime = Math.ceil(time / ms) * ms;
    } else if (direction === 'DOWN') {
      roundedTime = Math.floor(time / ms) * ms;
    } else {
      roundedTime = Math.round(time / ms) * ms;
    }
    return new Date(roundedTime);
  }
}

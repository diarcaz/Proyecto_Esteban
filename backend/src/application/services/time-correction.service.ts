import { lockPeriodReview, invalidatePeriodReviews } from './period-review-state';
import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '@infrastructure/persistence/prisma/prisma.service';
import { AuthorizationService } from '@domain/security/authorization.service';
import { Permission } from '@domain/permissions/permission.enum';
import { CreateTimeCorrectionDto, ReviewTimeCorrectionDto } from '@adapters/dtos/time-correction.dtos';

/**
 * Canonical shift duration calculator.
 * Used by BOTH CLOCK_OUT and correction approval to guarantee identical results.
 *
 * Phase 3.2: Lunch/break deduction is applied consistently.
 * Phase 3.2: No hardcoded 480-minute overtime threshold — raw worked minutes are preserved.
 */
export function calculateShiftWorkedMinutes(
  effectiveIn: Date,
  effectiveOut: Date,
  logs: Array<{ punchType: string; timestamp: Date }>,
): { workedMinutes: number; breakMinutes: number; grossMinutes: number } {
  const grossMinutes = Math.max(0, Math.round((effectiveOut.getTime() - effectiveIn.getTime()) / (1000 * 60)));

  // Calculate break/lunch deductions
  let breakMinutes = 0;

  // LUNCH_START/LUNCH_END pair
  const lunch1Start = logs.find((l) => l.punchType === 'LUNCH_START');
  const lunch1End = logs.find((l) => l.punchType === 'LUNCH_END');
  if (lunch1Start && lunch1End) {
    breakMinutes += Math.max(0, Math.round((lunch1End.timestamp.getTime() - lunch1Start.timestamp.getTime()) / (1000 * 60)));
  }

  // LUNCH2_START/LUNCH2_END pair
  const lunch2Start = logs.find((l) => l.punchType === 'LUNCH2_START');
  const lunch2End = logs.find((l) => l.punchType === 'LUNCH2_END');
  if (lunch2Start && lunch2End) {
    breakMinutes += Math.max(0, Math.round((lunch2End.timestamp.getTime() - lunch2Start.timestamp.getTime()) / (1000 * 60)));
  }

  const workedMinutes = Math.max(0, grossMinutes - breakMinutes);

  return { workedMinutes, breakMinutes, grossMinutes };
}

@Injectable()
export class TimeCorrectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authzService: AuthorizationService,
  ) {}

  /**
   * Submits a new TimeCorrectionRequest (MISSED_CLOCK_OUT, INCORRECT_CLOCK_IN, INCORRECT_CLOCK_OUT).
   * Status is initialized to PENDING.
   * Original raw AttendanceLog punch evidence timestamps remain completely untouched.
   *
   * Phase 3.2 CRITICAL INVARIANT:
   * - Resolves ALL referenced resources (property, workShift, attendanceLog) server-side.
   * - Proves they ALL belong to the same authorized domain before creating the request.
   * - WorkShift.locationId === propertyId
   * - AttendanceLog.locationId === propertyId
   * - WorkShift.userId === target employee
   */
  async createCorrectionRequest(dto: CreateTimeCorrectionDto, currentUser: any) {
    if (!currentUser || !['SUPER_ADMIN','OWNER','ADMIN','MANAGER','LOCATION_ADMIN','SUPERVISOR'].includes(currentUser.role)) throw new ForbiddenException('Administrative correction access required.');
    const propertyId = dto.location_id;

    // Phase 3.2: Resolve property server-side to establish companyId
    const property = await this.prisma.location.findUnique({
      where: { id: propertyId },
      select: { id: true, companyId: true },
    });
    if (!property) throw new NotFoundException(`Property '${propertyId}' not found.`);

    // Phase 3.2: Enforce tenant isolation with server-resolved companyId
    this.authzService.assertCompanyAccess(currentUser, property.companyId);
      this.authzService.assertPropertyAccess(currentUser, propertyId, property.companyId);
      this.authzService.assertPermission(currentUser, Permission.TIME_EDIT, propertyId, property.companyId);

    let originalTimestamp: Date | null = null;
    let targetUserId = currentUser.id;

    // Phase 3.2: Cross-resource integrity validation
    let shift: any = null;
    let log: any = null;

    if (dto.work_shift_id) {
      shift = await this.prisma.workShift.findUnique({ where: { id: dto.work_shift_id } });
      if (!shift) throw new NotFoundException(`WorkShift '${dto.work_shift_id}' not found.`);

      // CRITICAL: WorkShift.locationId MUST match the requested propertyId
      if (shift.locationId !== propertyId) {
        throw new BadRequestException(
          `Cross-property integrity violation: WorkShift '${dto.work_shift_id}' belongs to property '${shift.locationId}' but correction targets property '${propertyId}'.`,
        );
      }

      targetUserId = shift.userId;
      originalTimestamp = dto.correction_type === 'INCORRECT_CLOCK_IN'
        ? shift.clockInTimestamp
        : shift.clockOutTimestamp || null;
    }

    if (dto.attendance_log_id) {
      log = await this.prisma.attendanceLog.findUnique({ where: { id: dto.attendance_log_id } });
      if (!log) throw new NotFoundException(`AttendanceLog '${dto.attendance_log_id}' not found.`);

      // CRITICAL: AttendanceLog.locationId MUST match the requested propertyId
      if (log.locationId !== propertyId) {
        throw new BadRequestException(
          `Cross-property integrity violation: AttendanceLog '${dto.attendance_log_id}' belongs to property '${log.locationId}' but correction targets property '${propertyId}'.`,
        );
      }

      // CRITICAL: If both workShiftId and attendanceLogId provided, verify shift link consistency
      if (dto.work_shift_id && log.workShiftId && log.workShiftId !== dto.work_shift_id) {
        throw new BadRequestException(
          `Cross-resource integrity violation: AttendanceLog '${dto.attendance_log_id}' is linked to WorkShift '${log.workShiftId}' but correction references WorkShift '${dto.work_shift_id}'.`,
        );
      }

      // Phase 3.2 Targeted Review (Item 4): AttendanceLog.userId MUST equal WorkShift.userId
      if (shift && log.userId !== shift.userId) {
        throw new BadRequestException(
          `Cross-resource employee integrity violation: WorkShift '${dto.work_shift_id}' belongs to employee '${shift.userId}' but AttendanceLog '${dto.attendance_log_id}' belongs to employee '${log.userId}'. Both records must belong to the same employee.`,
        );
      }

      if (!dto.work_shift_id) {
        originalTimestamp = log.timestamp;
        targetUserId = log.userId;
      }
    }

    // Item 4: Resulting TimeCorrectionRequest.userId MUST strictly match targetUserId
    if (shift && targetUserId !== shift.userId) {
      throw new BadRequestException(`Target employee mismatch for WorkShift '${shift.id}'.`);
    }

    const requestedTimestamp = new Date(dto.requested_timestamp);

    const request = await this.prisma.timeCorrectionRequest.create({
      data: {
        userId: targetUserId,
        propertyId,
        attendanceLogId: dto.attendance_log_id || null,
        workShiftId: dto.work_shift_id || null,
        originalTimestamp,
        requestedTimestamp,
        correctionType: dto.correction_type,
        reason: dto.reason,
        requestedById: currentUser.id,
        status: 'PENDING',
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: currentUser.id,
        action: 'TIME_CORRECTION_REQUESTED',
        targetEntity: `TimeCorrectionRequest:${request.id}`,
        details: {
          requestId: request.id,
          propertyId,
          correctionType: dto.correction_type,
          requestedTimestamp,
          reason: dto.reason,
        },
      },
    });

    return request;
  }

  /**
   * Approves a TimeCorrectionRequest.
   * Atomic Prisma transaction updates request status to APPROVED and applies effective timestamps to WorkShift.
   * Raw AttendanceLog timestamps remain untouched.
   *
   * Phase 3.2:
   * - Re-verifies WorkShift/property relationship from DB (does not trust stored request.propertyId alone).
   * - Never fabricates raw clockOutTimestamp for MISSED_CLOCK_OUT — stores in effectiveClockOut only.
   * - Uses canonical calculateShiftWorkedMinutes for lunch-adjusted duration.
   * - No hardcoded 480-minute overtime threshold.
   */
  async approveCorrectionRequest(id: string, dto: ReviewTimeCorrectionDto, currentUser: any) {
    if (!currentUser || !['SUPER_ADMIN','OWNER','ADMIN','MANAGER','LOCATION_ADMIN','SUPERVISOR'].includes(currentUser.role)) throw new ForbiddenException('Administrator approval required.');
    const request = await this.prisma.timeCorrectionRequest.findUnique({
      where: { id },
      include: { property: { select: { companyId: true } }, workShift: true },
    });
    if (!request) throw new NotFoundException(`TimeCorrectionRequest ${id} not found.`);

    // Enforce Company and Property isolation + TIME_APPROVE permission
    this.authzService.assertCompanyAccess(currentUser, request.property.companyId);
    this.authzService.assertPropertyAccess(currentUser, request.propertyId, request.property.companyId);
    this.authzService.assertPermission(currentUser, Permission.TIME_APPROVE, request.propertyId, request.property.companyId);

    if (request.status !== 'PENDING') {
      throw new BadRequestException(`Time correction request ${id} has already been reviewed (status: ${request.status}). Cannot approve twice.`);
    }

    const now = new Date();

    return await this.prisma.$transaction(async (tx) => {
      await lockPeriodReview(tx);
      // Phase 3.2 Targeted Review (Item 4): Re-verify fresh DB values inside transaction BEFORE status transition
      let shift: any = null;
      let log: any = null;

      if (request.workShiftId) {
        shift = await tx.workShift.findUnique({ where: { id: request.workShiftId } });
        if (!shift) {
          throw new NotFoundException(`Linked WorkShift '${request.workShiftId}' not found.`);
        }
        if (shift.locationId !== request.propertyId) {
          throw new BadRequestException(
            `Cross-property integrity violation on approval: WorkShift '${shift.id}' belongs to property '${shift.locationId}' but correction request targets property '${request.propertyId}'.`,
          );
        }
        if (shift.userId !== request.userId) {
          throw new BadRequestException(
            `Cross-user integrity violation on approval: WorkShift '${shift.id}' belongs to user '${shift.userId}' but correction request targets user '${request.userId}'.`,
          );
        }
      }

      if (request.attendanceLogId) {
        log = await tx.attendanceLog.findUnique({ where: { id: request.attendanceLogId } });
        if (!log) {
          throw new NotFoundException(`Linked AttendanceLog '${request.attendanceLogId}' not found.`);
        }
        if (log.locationId !== request.propertyId) {
          throw new BadRequestException(
            `Cross-property integrity violation on approval: AttendanceLog '${log.id}' belongs to property '${log.locationId}' but correction targets property '${request.propertyId}'.`,
          );
        }
        if (log.userId !== request.userId) {
          throw new BadRequestException(
            `Cross-user integrity violation on approval: AttendanceLog '${log.id}' belongs to user '${log.userId}' but correction targets user '${request.userId}'.`,
          );
        }
      }

      if (!shift && log?.workShiftId) {
        shift = await tx.workShift.findUnique({ where: { id: log.workShiftId } });
        if (!shift || shift.locationId !== request.propertyId || shift.userId !== request.userId) {
          throw new BadRequestException('Correction attendance must resolve to the same employee and property WorkShift.');
        }
      }
      if (shift && log?.workShiftId && shift.id !== log.workShiftId) {
        throw new BadRequestException('Correction attendance and WorkShift do not match.');
      }
      if (!shift) throw new BadRequestException('Reconcile attendance with a canonical WorkShift before approving a correction.');

      if (shift && log && shift.userId !== log.userId) {
        throw new BadRequestException(
          `Cross-resource employee integrity violation on approval: WorkShift belongs to employee '${shift.userId}' but AttendanceLog belongs to employee '${log.userId}'.`,
        );
      }

      // Atomic conditional update on status = PENDING
      const updateRes = await tx.timeCorrectionRequest.updateMany({
        where: { id, status: 'PENDING' },
        data: {
          status: 'APPROVED',
          effectiveTimestamp: request.requestedTimestamp,
          reviewedById: currentUser.id,
          reviewedAt: now,
          comments: dto?.comments || null,
        },
      });

      if (updateRes.count === 0) {
        throw new BadRequestException(`Time correction request ${id} has already been reviewed or does not exist.`);
      }

      // Update effective WorkShift state if linked
      if (shift) {
        let newEffectiveIn = shift.effectiveClockIn || shift.clockInTimestamp;
        let newEffectiveOut = shift.effectiveClockOut || shift.clockOutTimestamp;

          if (request.correctionType === 'INCORRECT_CLOCK_IN') {
            newEffectiveIn = request.requestedTimestamp;
          } else if (request.correctionType === 'MISSED_CLOCK_OUT' || request.correctionType === 'INCORRECT_CLOCK_OUT') {
            newEffectiveOut = request.requestedTimestamp;
          }

          // Validation 1: CLOCK_OUT after CLOCK_IN & Positive duration
          if (newEffectiveOut && newEffectiveOut.getTime() <= newEffectiveIn.getTime()) {
            throw new BadRequestException('Invalid correction range: Effective CLOCK_OUT must be after effective CLOCK_IN.');
          }

          // Validation 2: Active EmployeeAssignment / UserLocationAssignment at effective clock-in time
          const isAssignedLoc = await tx.userLocationAssignment.findFirst({
            where: { userId: request.userId, locationId: request.propertyId },
          });
          const isAssignedEmp = await tx.employeeAssignment.findFirst({
            where: {
              userId: request.userId,
              propertyId: request.propertyId,
              active: true,
              effectiveFrom: { lte: newEffectiveIn },
              OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: newEffectiveIn } }],
            },
          });
          if (!isAssignedLoc && !isAssignedEmp) {
            throw new BadRequestException('Invalid correction range: Employee had no active assignment for this property at the requested clock-in time.');
          }

          // Validation 3: Lunch/break interval bounding
          const shiftLogs = await tx.attendanceLog.findMany({
            where: { workShiftId: shift.id },
          });
          const breakLogs = shiftLogs.filter((l) =>
            ['LUNCH_START', 'LUNCH_END', 'LUNCH2_START', 'LUNCH2_END'].includes(l.punchType),
          );
          for (const blog of breakLogs) {
            const blogTime = blog.timestamp.getTime();
            if (blogTime <= newEffectiveIn.getTime() || (newEffectiveOut && blogTime >= newEffectiveOut.getTime())) {
              throw new BadRequestException('Invalid correction range: Requested shift interval conflicts with recorded lunch/break punches.');
            }
          }

          // Validation 4: Shift overlap protection against other WorkShifts for employee
          const otherShifts = await tx.workShift.findMany({
            where: {
              userId: request.userId,
              id: { not: shift.id },
            },
          });

          for (const os of otherShifts) {
            const osIn = os.effectiveClockIn || os.clockInTimestamp;
            const osOut = os.effectiveClockOut || os.clockOutTimestamp || new Date();

            const targetOut = newEffectiveOut || new Date();
            if (newEffectiveIn < osOut && targetOut > osIn) {
              throw new BadRequestException('Invalid correction range: Correction causes overlapping WorkShift for employee.');
            }
          }

          const updateData: any = {};
          if (request.correctionType === 'MISSED_CLOCK_OUT' || request.correctionType === 'INCORRECT_CLOCK_OUT') {
            updateData.effectiveClockOut = request.requestedTimestamp;
            // Phase 3.2: Do NOT fabricate raw clockOutTimestamp for MISSED_CLOCK_OUT
            // Only set if there was already a real clock-out punch
            if (request.correctionType === 'MISSED_CLOCK_OUT' && !shift.clockOutTimestamp) {
              // Raw clockOutTimestamp remains absent — approved timestamp goes to effective layer only
            } else {
              // INCORRECT_CLOCK_OUT: raw punch existed, preserve it. Only effective layer changes.
            }
            updateData.status = 'COMPLETED';

            // Phase 3.2: Use canonical calculation with lunch deduction
            const { workedMinutes } = calculateShiftWorkedMinutes(
              newEffectiveIn,
              request.requestedTimestamp,
              shiftLogs,
            );
            updateData.regularMinutes = workedMinutes;
            updateData.overtimeMinutes = 0;
          } else if (request.correctionType === 'INCORRECT_CLOCK_IN') {
            updateData.effectiveClockIn = request.requestedTimestamp;
            if (newEffectiveOut) {
              // Phase 3.2: Use canonical calculation with lunch deduction
              const { workedMinutes } = calculateShiftWorkedMinutes(
                request.requestedTimestamp,
                newEffectiveOut,
                shiftLogs,
              );
              updateData.regularMinutes = workedMinutes;
              updateData.overtimeMinutes = 0;
            }
          }

          await tx.workShift.update({
            where: { id: shift.id },
            data: updateData,
          });
        }

      await invalidatePeriodReviews(tx, request.userId, request.propertyId, currentUser.id);
      await tx.auditLog.create({
        data: {
          actorId: currentUser.id,
          action: 'TIME_CORRECTION_APPROVED',
          targetEntity: `TimeCorrectionRequest:${id}`,
          details: {
            requestId: id,
            propertyId: request.propertyId,
            effectiveTimestamp: request.requestedTimestamp,
            reviewedBy: currentUser.id,
          },
        },
      });

      return await tx.timeCorrectionRequest.findUnique({ where: { id } });
    });
  }

  /**
   * Rejects a TimeCorrectionRequest.
   * Request status is set to REJECTED. Effective WorkShift values remain unchanged.
   */
  async rejectCorrectionRequest(id: string, dto: ReviewTimeCorrectionDto, currentUser: any) {
    if (!currentUser || !['SUPER_ADMIN','OWNER','ADMIN','MANAGER','LOCATION_ADMIN','SUPERVISOR'].includes(currentUser.role)) throw new ForbiddenException('Administrator approval required.');
    const request = await this.prisma.timeCorrectionRequest.findUnique({
      where: { id },
      include: { property: { select: { companyId: true } } },
    });
    if (!request) throw new NotFoundException(`TimeCorrectionRequest ${id} not found.`);

    this.authzService.assertCompanyAccess(currentUser, request.property.companyId);
    this.authzService.assertPropertyAccess(currentUser, request.propertyId, request.property.companyId);
    this.authzService.assertPermission(currentUser, Permission.TIME_APPROVE, request.propertyId, request.property.companyId);

    if (request.status !== 'PENDING') {
      throw new BadRequestException(`Time correction request ${id} has already been reviewed (status: ${request.status}).`);
    }

    const now = new Date();

    const updateRes = await this.prisma.timeCorrectionRequest.updateMany({
      where: { id, status: 'PENDING' },
      data: {
        status: 'REJECTED',
        reviewedById: currentUser.id,
        reviewedAt: now,
        comments: dto?.comments || null,
      },
    });

    if (updateRes.count === 0) {
      throw new BadRequestException(`Time correction request ${id} has already been reviewed.`);
    }

    await this.prisma.auditLog.create({
      data: {
        actorId: currentUser.id,
        action: 'TIME_CORRECTION_REJECTED',
        targetEntity: `TimeCorrectionRequest:${id}`,
        details: {
          requestId: id,
          propertyId: request.propertyId,
          reviewedBy: currentUser.id,
        },
      },
    });

    return await this.prisma.timeCorrectionRequest.findUnique({ where: { id } });
  }

  /**
   * Phase 3.2 (D): Financial fields on included workShift are masked based on user permissions.
   * Uses Prisma select to avoid fetching sensitive fields when possible.
   */
  async getCorrectionRequests(currentUser: any, query: any) {
    if (!currentUser || !['SUPER_ADMIN','OWNER','ADMIN','MANAGER','LOCATION_ADMIN','SUPERVISOR'].includes(currentUser.role)) throw new ForbiddenException('Administrative correction access required.');
    const where: any = {};

    if (currentUser && currentUser.role !== 'SUPER_ADMIN') {
      where.property = { companyId: currentUser.companyId };
    }

    const targetPropertyId = query.propertyId || query.location_id;
    if (targetPropertyId) {
      // Phase 3.2: Resolve property server-side for tenant verification
      const prop = await this.prisma.location.findUnique({
        where: { id: targetPropertyId },
        select: { id: true, companyId: true },
      });
      if (prop) {
        this.authzService.assertPropertyAccess(currentUser, targetPropertyId, prop.companyId);
        this.authzService.assertPermission(currentUser, Permission.TIME_VIEW, targetPropertyId, prop.companyId);
      }
      where.propertyId = targetPropertyId;
    } else if (currentUser && currentUser.role !== 'SUPER_ADMIN' && currentUser.role !== 'OWNER') {
      const properties = await this.prisma.location.findMany({ where: { companyId: currentUser.companyId }, select: { id: true, companyId: true } });
      where.propertyId = { in: properties.filter(p => this.authzService.canAccessProperty(currentUser,p.id,p.companyId) && this.authzService.hasPermission(currentUser,Permission.TIME_VIEW,p.id,p.companyId)).map(p=>p.id) };
    }

    if (query.status) where.status = query.status;
    if (query.userId) where.userId = query.userId;

    // Item 3: Determine permission-specific visibility using tenant and property context
    let canViewPayRate = false;
    let canViewBillRate = false;
    let canViewMarkup = false;

    if (targetPropertyId) {
      const prop = await this.prisma.location.findUnique({
        where: { id: targetPropertyId },
        select: { id: true, companyId: true },
      });
      if (prop) {
        canViewPayRate = this.authzService.hasPermission(currentUser, Permission.VIEW_PAY_RATE, targetPropertyId, prop.companyId);
        canViewBillRate = this.authzService.hasPermission(currentUser, Permission.VIEW_BILL_RATE, targetPropertyId, prop.companyId);
        canViewMarkup = this.authzService.hasPermission(currentUser, Permission.VIEW_MARKUP, targetPropertyId, prop.companyId);
      }
    } else {
      canViewPayRate = this.authzService.hasCompanyPermission(currentUser, Permission.VIEW_PAY_RATE, currentUser?.companyId) ||
        (currentUser?.permissions?.includes(Permission.VIEW_PAY_RATE) ?? false);
      canViewBillRate = this.authzService.hasCompanyPermission(currentUser, Permission.VIEW_BILL_RATE, currentUser?.companyId) ||
        (currentUser?.permissions?.includes(Permission.VIEW_BILL_RATE) ?? false);
      canViewMarkup = this.authzService.hasCompanyPermission(currentUser, Permission.VIEW_MARKUP, currentUser?.companyId) ||
        (currentUser?.permissions?.includes(Permission.VIEW_MARKUP) ?? false);
    }

    // Build permission-specific Prisma select — never select unauthorized financial fields
    const workShiftSelect: any = {
      id: true,
      userId: true,
      locationId: true,
      departmentId: true,
      positionId: true,
      clockInTimestamp: true,
      clockOutTimestamp: true,
      effectiveClockIn: true,
      effectiveClockOut: true,
      regularMinutes: true,
      overtimeMinutes: true,
      status: true,
      createdAt: true,
    };

    if (canViewPayRate) {
      workShiftSelect.payRateApplied = true;
      workShiftSelect.otPayRateApplied = true;
    }
    if (canViewBillRate) {
      workShiftSelect.billRateApplied = true;
      workShiftSelect.otBillRateApplied = true;
    }
    if (canViewMarkup) {
      workShiftSelect.markupTypeApplied = true;
      workShiftSelect.markupValueApplied = true;
    }
    if (canViewBillRate || canViewMarkup) {
      workShiftSelect.minimumShiftMinsApplied = true;
    }

    const results = await this.prisma.timeCorrectionRequest.findMany({
      where,
      include: {
        user: { select: { id: true, employeeNumber: true, firstName: true, lastName: true } },
        property: { select: { id: true, name: true, locationCode: true, companyId: true } },
        requestedBy: { select: { id: true, firstName: true, lastName: true } },
        reviewedBy: { select: { id: true, firstName: true, lastName: true } },
        workShift: { select: workShiftSelect },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    // Phase 3.2: Apply property-specific financial masking on each result's workShift as defense-in-depth
    return results.map((r: any) => {
      const propertyCompanyId = r.property?.companyId;
      if (r.workShift) {
        r = {
          ...r,
          workShift: this.authzService.maskFinancialFields(
            r.workShift,
            currentUser,
            r.propertyId,
            propertyCompanyId,
          ),
        };
      }
      // Preserve original response contract (omit internal companyId if present on property)
      if (r.property && 'companyId' in r.property) {
        const { companyId, ...propertyRest } = r.property;
        r = { ...r, property: propertyRest };
      }
      return r;
    });
  }

  async getCorrectionRequestById(id: string, currentUser: any): Promise<any> {
    if (!currentUser || !['SUPER_ADMIN','OWNER','ADMIN','MANAGER','LOCATION_ADMIN','SUPERVISOR'].includes(currentUser.role)) throw new ForbiddenException('Administrative correction access required.');
    const request = await this.prisma.timeCorrectionRequest.findUnique({
      where: { id },
      include: {
        property: { select: { id: true, companyId: true, name: true } },
        user: { select: { id: true, employeeNumber: true, firstName: true, lastName: true } },
        requestedBy: { select: { id: true, firstName: true, lastName: true } },
        reviewedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!request) throw new NotFoundException(`TimeCorrectionRequest ${id} not found.`);

    if (currentUser) {
      this.authzService.assertCompanyAccess(currentUser, request.property.companyId);
        this.authzService.assertPropertyAccess(currentUser, request.propertyId, request.property.companyId);
        this.authzService.assertPermission(currentUser, Permission.TIME_VIEW, request.propertyId, request.property.companyId);
    }

    // Item 3: Build permission-specific Prisma select for single request workShift query
    if (request.workShiftId) {
      const canViewPayRate = this.authzService.hasPermission(
        currentUser,
        Permission.VIEW_PAY_RATE,
        request.propertyId,
        request.property.companyId,
      );
      const canViewBillRate = this.authzService.hasPermission(
        currentUser,
        Permission.VIEW_BILL_RATE,
        request.propertyId,
        request.property.companyId,
      );
      const canViewMarkup = this.authzService.hasPermission(
        currentUser,
        Permission.VIEW_MARKUP,
        request.propertyId,
        request.property.companyId,
      );

      const shiftSelect: any = {
        id: true,
        userId: true,
        locationId: true,
        departmentId: true,
        positionId: true,
        clockInTimestamp: true,
        clockOutTimestamp: true,
        effectiveClockIn: true,
        effectiveClockOut: true,
        regularMinutes: true,
        overtimeMinutes: true,
        status: true,
        createdAt: true,
      };

      if (canViewPayRate) {
        shiftSelect.payRateApplied = true;
        shiftSelect.otPayRateApplied = true;
      }
      if (canViewBillRate) {
        shiftSelect.billRateApplied = true;
        shiftSelect.otBillRateApplied = true;
      }
      if (canViewMarkup) {
        shiftSelect.markupTypeApplied = true;
        shiftSelect.markupValueApplied = true;
      }
      if (canViewBillRate || canViewMarkup) {
        shiftSelect.minimumShiftMinsApplied = true;
      }

      const rawShift = await this.prisma.workShift.findUnique({
        where: { id: request.workShiftId },
        select: shiftSelect,
      });

      if (rawShift) {
        (request as any).workShift = this.authzService.maskFinancialFields(
          rawShift,
          currentUser,
          request.propertyId,
          request.property.companyId,
        );
      }
    }

    return request;
  }
}

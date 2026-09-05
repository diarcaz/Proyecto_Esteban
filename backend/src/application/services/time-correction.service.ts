import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '@infrastructure/persistence/prisma/prisma.service';
import { AuthorizationService } from '@domain/security/authorization.service';
import { Permission } from '@domain/permissions/permission.enum';
import { CreateTimeCorrectionDto, ReviewTimeCorrectionDto } from '@adapters/dtos/time-correction.dtos';

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
   */
  async createCorrectionRequest(dto: CreateTimeCorrectionDto, currentUser: any) {
    const propertyId = dto.location_id;
    this.authzService.assertCompanyAccess(currentUser, currentUser.companyId);
    this.authzService.assertPropertyAccess(currentUser, propertyId);

    let originalTimestamp: Date | null = null;
    let targetUserId = currentUser.id;

    if (dto.attendance_log_id) {
      const log = await this.prisma.attendanceLog.findUnique({ where: { id: dto.attendance_log_id } });
      if (log) {
        originalTimestamp = log.timestamp;
        targetUserId = log.userId;
      }
    } else if (dto.work_shift_id) {
      const shift = await this.prisma.workShift.findUnique({ where: { id: dto.work_shift_id } });
      if (shift) {
        originalTimestamp = dto.correction_type === 'INCORRECT_CLOCK_IN'
          ? shift.clockInTimestamp
          : shift.clockOutTimestamp || null;
        targetUserId = shift.userId;
      }
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
   */
  async approveCorrectionRequest(id: string, dto: ReviewTimeCorrectionDto, currentUser: any) {
    const request = await this.prisma.timeCorrectionRequest.findUnique({
      where: { id },
      include: { property: { select: { companyId: true } }, workShift: true },
    });
    if (!request) throw new NotFoundException(`TimeCorrectionRequest ${id} not found.`);

    // Enforce Company and Property isolation + TIME_APPROVE permission
    this.authzService.assertCompanyAccess(currentUser, request.property.companyId);
    this.authzService.assertPropertyAccess(currentUser, request.propertyId, request.property.companyId);
    this.authzService.assertPermission(currentUser, Permission.TIME_APPROVE, request.propertyId);

    if (request.status !== 'PENDING') {
      throw new BadRequestException(`Time correction request ${id} has already been reviewed (status: ${request.status}). Cannot approve twice.`);
    }

    const now = new Date();

    return await this.prisma.$transaction(async (tx) => {
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
      if (request.workShiftId) {
        const shift = await tx.workShift.findUnique({ where: { id: request.workShiftId } });
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
            updateData.clockOutTimestamp = shift.clockOutTimestamp || request.requestedTimestamp;
            updateData.status = 'COMPLETED';

            const grossMins = Math.max(0, Math.round((request.requestedTimestamp.getTime() - newEffectiveIn.getTime()) / (1000 * 60)));
            updateData.regularMinutes = Math.min(grossMins, 480);
            updateData.overtimeMinutes = Math.max(0, grossMins - 480);
          } else if (request.correctionType === 'INCORRECT_CLOCK_IN') {
            updateData.effectiveClockIn = request.requestedTimestamp;
            if (newEffectiveOut) {
              const grossMins = Math.max(0, Math.round((newEffectiveOut.getTime() - request.requestedTimestamp.getTime()) / (1000 * 60)));
              updateData.regularMinutes = Math.min(grossMins, 480);
              updateData.overtimeMinutes = Math.max(0, grossMins - 480);
            }
          }

          await tx.workShift.update({
            where: { id: shift.id },
            data: updateData,
          });
        }
      }

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
    const request = await this.prisma.timeCorrectionRequest.findUnique({
      where: { id },
      include: { property: { select: { companyId: true } } },
    });
    if (!request) throw new NotFoundException(`TimeCorrectionRequest ${id} not found.`);

    this.authzService.assertCompanyAccess(currentUser, request.property.companyId);
    this.authzService.assertPropertyAccess(currentUser, request.propertyId, request.property.companyId);
    this.authzService.assertPermission(currentUser, Permission.TIME_APPROVE, request.propertyId);

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

  async getCorrectionRequests(currentUser: any, query: any) {
    const where: any = {};

    if (currentUser && currentUser.role !== 'SUPER_ADMIN') {
      where.property = { companyId: currentUser.companyId };
    }

    if (query.propertyId) {
      this.authzService.assertPropertyAccess(currentUser, query.propertyId);
      where.propertyId = query.propertyId;
    } else if (currentUser && currentUser.role !== 'SUPER_ADMIN' && currentUser.role !== 'OWNER' && currentUser.role !== 'CLIENT_ADMIN') {
      const assigned = currentUser.assignedLocationIds || [];
      where.propertyId = { in: assigned.length > 0 ? assigned : ['none'] };
    }

    if (query.status) where.status = query.status;
    if (query.userId) where.userId = query.userId;

    return await this.prisma.timeCorrectionRequest.findMany({
      where,
      include: {
        user: { select: { id: true, employeeNumber: true, firstName: true, lastName: true } },
        property: { select: { id: true, name: true, locationCode: true } },
        requestedBy: { select: { id: true, firstName: true, lastName: true } },
        reviewedBy: { select: { id: true, firstName: true, lastName: true } },
        workShift: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async getCorrectionRequestById(id: string, currentUser: any) {
    const request = await this.prisma.timeCorrectionRequest.findUnique({
      where: { id },
      include: {
        property: { select: { id: true, companyId: true, name: true } },
        user: { select: { id: true, employeeNumber: true, firstName: true, lastName: true } },
        requestedBy: { select: { id: true, firstName: true, lastName: true } },
        reviewedBy: { select: { id: true, firstName: true, lastName: true } },
        workShift: true,
      },
    });
    if (!request) throw new NotFoundException(`TimeCorrectionRequest ${id} not found.`);

    if (currentUser) {
      this.authzService.assertCompanyAccess(currentUser, request.property.companyId);
      this.authzService.assertPropertyAccess(currentUser, request.propertyId, request.property.companyId);
    }

    return request;
  }
}

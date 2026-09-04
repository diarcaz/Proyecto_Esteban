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
      const updatedRequest = await tx.timeCorrectionRequest.update({
        where: { id },
        data: {
          status: 'APPROVED',
          effectiveTimestamp: request.requestedTimestamp,
          reviewedById: currentUser.id,
          reviewedAt: now,
          comments: dto?.comments || null,
        },
      });

      // Update effective WorkShift state if linked
      if (request.workShiftId) {
        const shift = await tx.workShift.findUnique({ where: { id: request.workShiftId } });
        if (shift) {
          const updateData: any = {};
          if (request.correctionType === 'MISSED_CLOCK_OUT' || request.correctionType === 'INCORRECT_CLOCK_OUT') {
            updateData.effectiveClockOut = request.requestedTimestamp;
            updateData.clockOutTimestamp = shift.clockOutTimestamp || request.requestedTimestamp;
            updateData.status = 'COMPLETED';

            const effectiveIn = shift.effectiveClockIn || shift.clockInTimestamp;
            const grossMins = Math.max(0, Math.round((request.requestedTimestamp.getTime() - effectiveIn.getTime()) / (1000 * 60)));
            updateData.regularMinutes = Math.min(grossMins, 480);
            updateData.overtimeMinutes = Math.max(0, grossMins - 480);
          } else if (request.correctionType === 'INCORRECT_CLOCK_IN') {
            updateData.effectiveClockIn = request.requestedTimestamp;
            const effectiveOut = shift.effectiveClockOut || shift.clockOutTimestamp;
            if (effectiveOut) {
              const grossMins = Math.max(0, Math.round((effectiveOut.getTime() - request.requestedTimestamp.getTime()) / (1000 * 60)));
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

      return updatedRequest;
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

    const updatedRequest = await this.prisma.timeCorrectionRequest.update({
      where: { id },
      data: {
        status: 'REJECTED',
        reviewedById: currentUser.id,
        reviewedAt: now,
        comments: dto?.comments || null,
      },
    });

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

    return updatedRequest;
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

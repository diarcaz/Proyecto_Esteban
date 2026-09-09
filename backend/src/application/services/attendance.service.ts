import { resolvePropertyReadScope } from '@domain/security/property-read-scope';
import { resolveEmployeeClockAssignment } from './employee-clock-context';
import { AuthorizationService } from '@domain/security/authorization.service';
import { Permission } from '@domain/permissions/permission.enum';
import { Injectable, BadRequestException, UnauthorizedException, NotFoundException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '@infrastructure/persistence/prisma/prisma.service';
import { RedisService } from '@infrastructure/cache/redis.service';
import { WorkShiftService } from './work-shift.service';
import { assertLocationAccess } from '@infrastructure/auth/location-access.util';
import { StandardClockDto, KioskClockDto, KioskStatusDto, PunchQueryDto } from '@adapters/dtos/attendance.dtos';
import { AttendanceType, AttendanceStatus, AttendanceMethod } from '@domain/entities/attendance-log.entity';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly workShiftService: WorkShiftService,
  ) {}

  async processStandardClock(userId: string, dto: StandardClockDto) {
    const timestamp = new Date();
    return this.executePunchSequence(userId, dto.location_id, dto.type, dto.method, timestamp, dto.device_info, dto.location_coordinates);
  }

  /**
   * Authoritative Phase 4 Kiosk Property Resolver.
   * Enforces Constraint 1:
   * - At least one of property_id or location_code must be provided.
   * - If only property_id: resolve Location by UUID.
   * - If only location_code: 0 -> NotFound, 1 -> use it, 2+ -> reject as ambiguous.
   * - If BOTH provided: they MUST resolve to the SAME Location; otherwise reject with BadRequest.
   */
  async resolveKioskProperty(propertyId?: string, locationCode?: string) {
    if (!propertyId && !locationCode) {
      throw new BadRequestException('Either property_id or location_code must be provided for kiosk terminal context.');
    }

    let propertyById: any = null;
    if (propertyId) {
      propertyById = await this.prisma.location.findUnique({
        where: { id: propertyId },
      });
      if (!propertyById) {
        throw new NotFoundException('Property not found.');
      }
    }

    let propertyByCode: any = null;
    if (locationCode) {
      const matchingLocations = await this.prisma.location.findMany({
        where: { locationCode },
      });
      if (matchingLocations.length === 0) {
        throw new NotFoundException('Property not found.');
      }
      if (matchingLocations.length > 1) {
        throw new BadRequestException(
          'Configuration ambiguity: Multiple locations match this code. Use property_id.',
        );
      }
      propertyByCode = matchingLocations[0];
    }

    if (propertyById && propertyByCode) {
      if (propertyById.id !== propertyByCode.id) {
        throw new BadRequestException(
          'Contradictory location context.',
        );
      }
      return propertyById;
    }

    return propertyById || propertyByCode;
  }

  /**
   * Shared Kiosk Identity & Context Resolution.
   * Enforces Constraints 1, 2, 3:
   * - Deterministic unique employeeNumber lookup (no candidate scan loops)
   * - Redis rate-limiting / lockout protection
   * - Constant property resolution
   * - Strict EmployeeAssignment ambiguity validation (Phase 3.2 rules)
   */
  async resolveKioskIdentityAndContext(
    employeeNumber: string,
    pinCode: string,
    propertyId?: string,
    locationCode?: string,
    timestamp: Date = new Date(),
  ) {
    if (typeof employeeNumber !== 'string' || !employeeNumber.trim() || typeof pinCode !== 'string' || !/^\d{6}$/.test(pinCode)) {
      throw new BadRequestException('Employee number and PIN code are required.');
    }

    const lockKey = `kiosk_pin:${employeeNumber.trim()}`;
    const failedAttempts = await this.kioskLockout(() => this.redisService.getFailedAttempts(lockKey, true));
    if (failedAttempts >= 5) {
      throw new UnauthorizedException(
        'Account temporarily locked due to multiple failed PIN attempts. Please wait 15 minutes or contact administrator.',
      );
    }

    // Single deterministic lookup by unique employeeNumber
    const user = await this.prisma.user.findUnique({
      where: { employeeNumber: employeeNumber.trim() },
    });

    if (!user || user.status !== 'ACTIVE' || !user.pinCodeHash || !(await bcrypt.compare(pinCode, user.pinCodeHash))) {
      const attempts = await this.kioskLockout(() => this.redisService.incrementFailedAttempts(lockKey, 900, true));
      if (attempts >= 5) throw new UnauthorizedException('Account temporarily locked. Please try later.');
      throw new UnauthorizedException('Invalid employee credentials.');
    }
    await this.kioskLockout(() => this.redisService.resetFailedAttempts(lockKey, true));

    // Resolve property context
    const location = await this.resolveKioskProperty(propertyId, locationCode);

    const assignment = await resolveEmployeeClockAssignment(this.prisma, user.id, location.id, timestamp);

    return { user, location, assignment };
  }

  /**
   * Evaluates kiosk employee status, active shift, and allowed punch actions.
   * Returns ZERO financial fields. Pure evaluation complying with Constraint 4.
   */
  async getKioskEmployeeStatus(dto: KioskStatusDto) {
    const timestamp = new Date();
    const { user, location, assignment } = await this.resolveKioskIdentityAndContext(
      dto.employee_number,
      dto.pin_code,
      dto.property_id,
      dto.location_code,
      timestamp,
    );

    const shiftState = await this.workShiftService.getEmployeeShiftState(user.id, location.id, timestamp);

    return {
      employee: {
        id: user.id,
        employeeNumber: user.employeeNumber,
        firstName: user.firstName,
        lastName: user.lastName,
        displayName: `${user.firstName} ${user.lastName}`.trim(),
        department: assignment?.department ? { id: assignment.department.id, name: assignment.department.name } : null,
        position: assignment?.position ? { id: assignment.position.id, title: assignment.position.title } : null,
      },
      location: {
        id: location.id,
        name: location.name,
        locationCode: location.locationCode,
        timezone: location.timezone,
      },
      shiftState,
      serverTime: timestamp.toISOString(),
    };
  }

  async processKioskClock(dto: KioskClockDto) {
    const timestamp = new Date();
    const { user, location } = await this.resolveKioskIdentityAndContext(
      dto.employee_number,
      dto.pin_code,
      dto.property_id,
      dto.location_code,
      timestamp,
    );

    try {
      const result = await this.workShiftService.processPunchSequence(user.id, location.id, dto.type, AttendanceMethod.KIOSK_PIN, timestamp, dto.device_info, dto.location_coordinates);
      const log = result?.log;
      if (!log || log.userId !== user.id || log.locationId !== location.id) throw new ServiceUnavailableException('Punch confirmation unavailable. Ask an administrator to check the shift.');
      return {
        id: log.id, punchType: log.punchType, timestamp: log.timestamp,
        effectiveTimestamp: log.effectiveTimestamp,
        employee: { employeeNumber: user.employeeNumber, displayName: `${user.firstName} ${user.lastName}`.trim() },
        location: { id: location.id, name: location.name, locationCode: location.locationCode, timezone: location.timezone },
      };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      if (error instanceof ForbiddenException) throw new ForbiddenException('Clock operation is not permitted for this employee and property.');
      throw new BadRequestException('Clock action cannot be completed. Refresh status or contact an administrator.');
    }
  }

  private async kioskLockout<T>(operation: () => Promise<T>): Promise<T> {
    try { return await operation(); }
    catch { throw new ServiceUnavailableException('Clock authentication temporarily unavailable. Please try later.'); }
  }

  async getPunches(query: PunchQueryDto, currentUser: any, headers: Record<string, any> = {}) {
    const properties = await resolvePropertyReadScope(this.prisma, currentUser, query, headers, Permission.TIME_VIEW);
    const where: any = { locationId: { in: properties.map(p => p.id) } };
    if (currentUser.role !== 'SUPER_ADMIN') where.location = { companyId: currentUser.companyId };

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
    const result = await this.workShiftService.processPunchSequence(
      userId,
      locationId,
      type,
      method,
      timestamp,
      deviceInfo,
      locationCoordinates,
    );
    if (!result?.log) throw new ServiceUnavailableException('Punch confirmation unavailable.');
    return result.log;
  }

  /**
   * @deprecated Phase 3.2: Direct raw AttendanceLog timestamp mutation is prohibited.
   * All time corrections MUST use the TimeCorrectionRequest workflow to preserve audit integrity.
   * Raw AttendanceLog.timestamp is immutable evidence.
   */
  async adjustPunchTime(id: string, dto: { actualIn?: string; actualOut?: string }, currentUserOrActorId: any, ipAddress?: string) {
    throw new BadRequestException(
      'Direct punch mutation is deprecated (Phase 3.2). All time corrections must use the TimeCorrectionRequest workflow to preserve raw attendance evidence integrity.',
    );
  }

  /**
   * @deprecated Phase 3.2: Direct AttendanceLog mutation for overtime approval is prohibited.
   * Overtime must be managed through the TimeCorrectionRequest and configured overtime rules.
   */
  async approveOvertime(id: string, currentUserOrActorId: any, ipAddress?: string) {
    throw new BadRequestException(
      'Direct overtime approval on raw AttendanceLog is deprecated (Phase 3.2). Use TimeCorrectionRequest workflow.',
    );
  }
}

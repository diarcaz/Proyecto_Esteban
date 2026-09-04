import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '@infrastructure/persistence/prisma/prisma.service';
import { encryptPin, decryptPin } from '@infrastructure/security/pin-encryption.util';
import { AuthorizationService } from '@domain/security/authorization.service';
import { Permission } from '@domain/permissions/permission.enum';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authzService: AuthorizationService,
  ) {}

  /**
   * Helper to construct Prisma select clause with query-level financial field protection.
   * If user lacks VIEW_PAY_RATE permission, hourlyRate is excluded directly from the Prisma SQL query.
   */
  private getStaffSelect(canViewPayRate: boolean) {
    const now = new Date();
    return {
      id: true,
      companyId: true,
      employeeNumber: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
      status: true,
      jobPositionCode: true,
      hourlyRate: canViewPayRate,
      preferredLanguage: true,
      createdAt: true,
      updatedAt: true,
      assignments: {
        select: {
          locationId: true,
          location: { select: { id: true, name: true, locationCode: true, companyId: true } },
        },
      },
      employeeAssignments: {
        where: {
          active: true,
          effectiveFrom: { lte: now },
          OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: now } }],
        },
        select: {
          id: true,
          propertyId: true,
          property: { select: { id: true, name: true, locationCode: true, companyId: true } },
          departmentId: true,
          department: { select: { id: true, name: true, deptCode: true } },
          positionId: true,
          position: { select: { id: true, title: true, code: true } },
        },
      },
    };
  }

  async findAll(allowedLocationIds?: string[], currentUser?: any) {
    const where: any = { status: 'ACTIVE' };

    // 1. Enforce Company isolation for non-SUPER_ADMIN users
    if (currentUser && currentUser.role !== 'SUPER_ADMIN') {
      where.companyId = currentUser.companyId;
    }

    // 2. Resolve server-derived authorized property IDs vs client-provided requested allowedLocationIds
    let isGlobalTenantView = false;
    let authorizedPropertyIds: string[] = [];

    if (!currentUser || currentUser.role === 'SUPER_ADMIN') {
      isGlobalTenantView = true;
    } else if (currentUser.role === 'OWNER' || currentUser.role === 'CLIENT_ADMIN') {
      isGlobalTenantView = true;
    } else {
      const assigned = currentUser.assignedLocationIds || [];
      const propAccess = (currentUser.propertyAccess || []).map((pa: any) => pa.propertyId);
      authorizedPropertyIds = Array.from(new Set([...assigned, ...propAccess]));
    }

    let effectivePropertyIds: string[] | null = null;

    if (allowedLocationIds && allowedLocationIds.length > 0) {
      if (isGlobalTenantView) {
        effectivePropertyIds = allowedLocationIds;
      } else {
        // CRITICAL INVARIANT: Intersect requested IDs with server-derived authorized IDs
        effectivePropertyIds = allowedLocationIds.filter((id) => authorizedPropertyIds.includes(id));
      }
    } else if (!isGlobalTenantView) {
      effectivePropertyIds = authorizedPropertyIds;
    }

    // 3. If effective property set is empty for a restricted user, return empty array immediately
    if (effectivePropertyIds !== null && effectivePropertyIds.length === 0) {
      return [];
    }

    // 4. Apply dual assignment matching (UserLocationAssignment + active EmployeeAssignment)
    if (effectivePropertyIds !== null) {
      const now = new Date();
      where.OR = [
        {
          assignments: {
            some: {
              locationId: { in: effectivePropertyIds },
            },
          },
        },
        {
          employeeAssignments: {
            some: {
              propertyId: { in: effectivePropertyIds },
              active: true,
              effectiveFrom: { lte: now },
              OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: now } }],
            },
          },
        },
      ];
    }

    const canViewPayRate = currentUser
      ? (isGlobalTenantView
          ? this.authzService.hasPermission(currentUser, Permission.VIEW_PAY_RATE)
          : effectivePropertyIds!.some((pId) => this.authzService.hasPermission(currentUser, Permission.VIEW_PAY_RATE, pId)))
      : true;

    const users = await this.prisma.user.findMany({
      where,
      select: {
        ...this.getStaffSelect(canViewPayRate),
        pinCodeHash: true,
      },
      orderBy: { firstName: 'asc' },
    });

    return users.map((u) => {
      const { pinCodeHash, ...rawUser } = u;

      // Filter assignment metadata so unauthorized property assignments are removed from response DTO
      const safeUser = this.authzService.filterUserAssignments(
        rawUser,
        currentUser,
        effectivePropertyIds || undefined,
      );

      const empPropIds = this.authzService.getEmployeePropertyIds(u);
      const primaryLocId = empPropIds[0] || null;

      // Apply service-level financial masking (defense-in-depth)
      const masked = this.authzService.maskFinancialFields(safeUser, currentUser, primaryLocId || undefined);

      return {
        ...masked,
        hasPin: !!pinCodeHash,
        pinCode: null, // Generic list response NEVER leaks raw or decrypted PINs
        locationId: primaryLocId,
        locationCode: u.assignments?.[0]?.location?.locationCode || null,
      };
    });
  }

  async findOne(id: string, currentUser?: any) {
    const now = new Date();
    const existing = await this.prisma.user.findUnique({
      where: { id },
      include: {
        assignments: { select: { locationId: true } },
        employeeAssignments: {
          where: {
            active: true,
            effectiveFrom: { lte: now },
            OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: now } }],
          },
          select: { propertyId: true },
        },
      },
    });
    if (!existing) throw new NotFoundException(`Staff member ${id} not found.`);

    let sharedPropIds: string[] = [];
    if (currentUser) {
      // Assert company isolation & assert actor property authorization across employee properties
      sharedPropIds = this.authzService.assertCanAccessEmployee(currentUser, existing);
    } else {
      sharedPropIds = this.authzService.getEmployeePropertyIds(existing);
    }

    const canViewPayRate = currentUser
      ? (sharedPropIds.length > 0
          ? sharedPropIds.some((pId) => this.authzService.hasPermission(currentUser, Permission.VIEW_PAY_RATE, pId))
          : this.authzService.hasPermission(currentUser, Permission.VIEW_PAY_RATE))
      : true;

    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        ...this.getStaffSelect(canViewPayRate),
        pinCodeHash: true,
      },
    });
    if (!user) throw new NotFoundException(`Staff member ${id} not found.`);

    const { pinCodeHash, ...rawUser } = user;

    // Filter assignment metadata so unauthorized property assignments are removed from response DTO
    const safeUser = this.authzService.filterUserAssignments(rawUser, currentUser, sharedPropIds);

    const primarySharedLocId = sharedPropIds[0] || undefined;
    const masked = this.authzService.maskFinancialFields(safeUser, currentUser, primarySharedLocId);

    return {
      ...masked,
      hasPin: !!pinCodeHash,
      pinCode: null, // Generic single fetch NEVER leaks decrypted PIN automatically
    };
  }

  /**
   * Explicit action endpoint to retrieve employee's decrypted 6-digit PIN.
   * Requires VIEW_EMPLOYEE_PIN permission on at least one shared Property.
   */
  async getDecryptedPin(id: string, currentUser: any) {
    const now = new Date();
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        companyId: true,
        employeeNumber: true,
        firstName: true,
        lastName: true,
        pinCodeEncrypted: true,
        assignments: { select: { locationId: true } },
        employeeAssignments: {
          where: {
            active: true,
            effectiveFrom: { lte: now },
            OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: now } }],
          },
          select: { propertyId: true },
        },
      },
    });
    if (!user) throw new NotFoundException(`Staff member ${id} not found.`);

    // 1. Assert Company isolation & get shared authorized properties
    const sharedPropIds = this.authzService.assertCanAccessEmployee(currentUser, user);

    // 2. Determine which shared property grants VIEW_EMPLOYEE_PIN
    let authorizingPropId: string | undefined = undefined;

    if (currentUser.role === 'SUPER_ADMIN' || currentUser.role === 'OWNER' || currentUser.role === 'CLIENT_ADMIN') {
      authorizingPropId = sharedPropIds[0] || undefined;
    } else {
      authorizingPropId = sharedPropIds.find((pId) =>
        this.authzService.hasPermission(currentUser, Permission.VIEW_EMPLOYEE_PIN, pId),
      );
    }

    if (!authorizingPropId && currentUser.role !== 'SUPER_ADMIN' && currentUser.role !== 'OWNER' && currentUser.role !== 'CLIENT_ADMIN') {
      throw new ForbiddenException(
        `Required permission '${Permission.VIEW_EMPLOYEE_PIN}' is missing for employee ${user.employeeNumber} in authorized properties.`,
      );
    }

    const decryptedPin = decryptPin(user.pinCodeEncrypted);

    // Security Audit Log (audits using the specific authorizing property ID)
    await this.prisma.auditLog.create({
      data: {
        actorId: currentUser.id,
        action: 'VIEW_EMPLOYEE_PIN',
        targetEntity: `User:${id}`,
        details: {
          targetEmployeeNumber: user.employeeNumber,
          targetName: `${user.firstName} ${user.lastName}`,
          authorizingPropertyId: authorizingPropId || null,
        },
      },
    });

    return {
      id: user.id,
      employeeNumber: user.employeeNumber,
      firstName: user.firstName,
      lastName: user.lastName,
      pinCode: decryptedPin || null,
    };
  }

  /**
   * Explicit action endpoint to reset/replace an employee's 6-digit PIN.
   * Requires RESET_EMPLOYEE_PIN permission on at least one shared Property.
   */
  async resetPin(id: string, newPinCode: string, currentUser: any) {
    if (!newPinCode || newPinCode.length !== 6 || !/^\d{6}$/.exec(newPinCode)) {
      throw new BadRequestException('PIN code must be exactly 6 digits.');
    }

    const now = new Date();
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        companyId: true,
        employeeNumber: true,
        firstName: true,
        lastName: true,
        assignments: { select: { locationId: true } },
        employeeAssignments: {
          where: {
            active: true,
            effectiveFrom: { lte: now },
            OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: now } }],
          },
          select: { propertyId: true },
        },
      },
    });
    if (!user) throw new NotFoundException(`Staff member ${id} not found.`);

    // 1. Assert Company isolation & get shared authorized properties
    const sharedPropIds = this.authzService.assertCanAccessEmployee(currentUser, user);

    // 2. Determine which shared property grants RESET_EMPLOYEE_PIN
    let authorizingPropId: string | undefined = undefined;

    if (currentUser.role === 'SUPER_ADMIN' || currentUser.role === 'OWNER' || currentUser.role === 'CLIENT_ADMIN') {
      authorizingPropId = sharedPropIds[0] || undefined;
    } else {
      authorizingPropId = sharedPropIds.find((pId) =>
        this.authzService.hasPermission(currentUser, Permission.RESET_EMPLOYEE_PIN, pId),
      );
    }

    if (!authorizingPropId && currentUser.role !== 'SUPER_ADMIN' && currentUser.role !== 'OWNER' && currentUser.role !== 'CLIENT_ADMIN') {
      throw new ForbiddenException(
        `Required permission '${Permission.RESET_EMPLOYEE_PIN}' is missing for employee ${user.employeeNumber} in authorized properties.`,
      );
    }

    const pinCodeHash = await bcrypt.hash(newPinCode, 10);
    const pinCodeEncrypted = encryptPin(newPinCode);

    await this.prisma.user.update({
      where: { id },
      data: {
        pinCodeHash,
        pinCodeEncrypted,
      },
    });

    // Security Audit Log
    await this.prisma.auditLog.create({
      data: {
        actorId: currentUser.id,
        action: 'RESET_EMPLOYEE_PIN',
        targetEntity: `User:${id}`,
        details: {
          targetEmployeeNumber: user.employeeNumber,
          targetName: `${user.firstName} ${user.lastName}`,
          authorizingPropertyId: authorizingPropId || null,
        },
      },
    });

    return {
      success: true,
      message: `PIN code updated successfully for staff member ${user.firstName} ${user.lastName}.`,
    };
  }

  async create(dto: any, currentUser?: any) {
    if (currentUser) {
      // Privilege escalation safety check
      this.authzService.assertPrivilegeEscalationSafety(currentUser, dto.role, dto.permissions);

      if (dto.locationId) {
        this.authzService.assertPropertyAccess(currentUser, dto.locationId);
      }
    }

    // Derive companyId from currentUser for non-SUPER_ADMIN
    const targetCompanyId =
      currentUser && currentUser.role !== 'SUPER_ADMIN'
        ? currentUser.companyId
        : dto.companyId || currentUser?.companyId;

    const rawPassword = dto.password || crypto.randomBytes(24).toString('hex');
    const passwordHash = await bcrypt.hash(rawPassword, 10);
    const pinCodeHash = dto.pinCode ? await bcrypt.hash(dto.pinCode, 10) : null;
    const pinCodeEncrypted = dto.pinCode ? encryptPin(dto.pinCode) : null;

    const canViewPayRate = currentUser
      ? this.authzService.hasPermission(currentUser, Permission.VIEW_PAY_RATE, dto.locationId)
      : true;

    const user = await this.prisma.user.create({
      data: {
        companyId: targetCompanyId,
        employeeNumber: dto.employeeNumber || `EMP-${Date.now()}`,
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email || `${dto.firstName.toLowerCase()}.${dto.lastName.toLowerCase()}.${Date.now()}@nexustaff.com`,
        passwordHash,
        jobPositionCode: dto.jobPositionCode || 'STAFF',
        pinCodeHash,
        pinCodeEncrypted,
        preferredLanguage: dto.preferredLanguage || 'es',
        role: dto.role || 'WORKER',
        permissions: dto.permissions || [],
        status: 'ACTIVE',
      },
      select: this.getStaffSelect(canViewPayRate),
    });

    if (dto.locationId) {
      await this.prisma.userLocationAssignment.create({
        data: { userId: user.id, locationId: dto.locationId },
      });
    }

    // Security Audit Log
    if (currentUser) {
      await this.prisma.auditLog.create({
        data: {
          actorId: currentUser.id,
          action: 'USER_CREATE',
          targetEntity: `User:${user.id}`,
          details: {
            createdUserRole: user.role,
            createdUserEmail: user.email,
            companyId: targetCompanyId,
          },
        },
      });
    }

    const masked = this.authzService.maskFinancialFields(user, currentUser, dto.locationId);
    return {
      ...masked,
      hasPin: !!pinCodeHash,
      pinCode: null,
    };
  }

  async update(id: string, dto: any, currentUser?: any) {
    const now = new Date();
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        companyId: true,
        role: true,
        pinCodeHash: true,
        pinCodeEncrypted: true,
        assignments: { select: { locationId: true } },
        employeeAssignments: {
          where: {
            active: true,
            effectiveFrom: { lte: now },
            OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: now } }],
          },
          select: { propertyId: true },
        },
      },
    });
    if (!user) throw new NotFoundException(`Staff member ${id} not found.`);

    let sharedPropIds: string[] = [];
    if (currentUser) {
      sharedPropIds = this.authzService.assertCanAccessEmployee(currentUser, user);
      this.authzService.assertPrivilegeEscalationSafety(currentUser, dto.role, dto.permissions);

      if (dto.locationId) {
        this.authzService.assertPropertyAccess(currentUser, dto.locationId, user.companyId);
      }
    } else {
      sharedPropIds = this.authzService.getEmployeePropertyIds(user);
    }

    const pinCodeHash = dto.pinCode ? await bcrypt.hash(dto.pinCode, 10) : user.pinCodeHash;
    const pinCodeEncrypted = dto.pinCode ? encryptPin(dto.pinCode) : user.pinCodeEncrypted;

    const primaryLoc = dto.locationId || sharedPropIds[0];
    const canViewPayRate = currentUser
      ? this.authzService.hasPermission(currentUser, Permission.VIEW_PAY_RATE, primaryLoc)
      : true;

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        firstName: dto.firstName ?? undefined,
        lastName: dto.lastName ?? undefined,
        jobPositionCode: dto.jobPositionCode ?? undefined,
        role: dto.role ?? undefined,
        permissions: dto.permissions ?? undefined,
        pinCodeHash,
        pinCodeEncrypted,
        preferredLanguage: dto.preferredLanguage ?? undefined,
      },
      select: this.getStaffSelect(canViewPayRate),
    });

    if (dto.locationId) {
      await this.prisma.userLocationAssignment.deleteMany({ where: { userId: id } });
      await this.prisma.userLocationAssignment.create({
        data: { userId: id, locationId: dto.locationId },
      });
    }

    // Security Audit Log
    if (currentUser) {
      await this.prisma.auditLog.create({
        data: {
          actorId: currentUser.id,
          action: 'USER_EDIT',
          targetEntity: `User:${id}`,
          details: {
            updatedFields: Object.keys(dto),
          },
        },
      });
    }

    const safeUser = this.authzService.filterUserAssignments(updated, currentUser, sharedPropIds);
    const masked = this.authzService.maskFinancialFields(safeUser, currentUser, primaryLoc);

    return {
      ...masked,
      hasPin: !!pinCodeHash,
      pinCode: null,
    };
  }

  async remove(id: string, currentUser?: any) {
    const now = new Date();
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        companyId: true,
        firstName: true,
        lastName: true,
        assignments: { select: { locationId: true } },
        employeeAssignments: {
          where: {
            active: true,
            effectiveFrom: { lte: now },
            OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: now } }],
          },
          select: { propertyId: true },
        },
      },
    });
    if (!user) throw new NotFoundException(`Staff member ${id} not found.`);

    if (currentUser) {
      this.authzService.assertCanAccessEmployee(currentUser, user);
    }

    await this.prisma.user.update({ where: { id }, data: { status: 'TERMINATED' } });

    if (currentUser) {
      await this.prisma.auditLog.create({
        data: {
          actorId: currentUser.id,
          action: 'USER_DELETE',
          targetEntity: `User:${id}`,
          details: {
            deletedUserName: `${user.firstName} ${user.lastName}`,
          },
        },
      });
    }

    return { message: `Staff member ${user.firstName} ${user.lastName} removed successfully.` };
  }
}

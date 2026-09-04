import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '@infrastructure/persistence/prisma/prisma.service';
import { encryptPin, decryptPin } from '@infrastructure/security/pin-encryption.util';
import { AuthorizationService } from '@domain/security/authorization.service';
import { Permission } from '@domain/permissions/permission.enum';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

const USER_SAFE_SELECT = {
  id: true,
  companyId: true,
  employeeNumber: true,
  firstName: true,
  lastName: true,
  email: true,
  role: true,
  status: true,
  jobPositionCode: true,
  hourlyRate: true,
  preferredLanguage: true,
  createdAt: true,
  updatedAt: true,
  assignments: {
    select: {
      locationId: true,
      location: { select: { id: true, name: true, locationCode: true, companyId: true } },
    },
  },
};

@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authzService: AuthorizationService,
  ) {}

  async findAll(allowedLocationIds?: string[], currentUser?: any) {
    const where: any = { status: 'ACTIVE' };

    // 1. Enforce Company isolation for non-SUPER_ADMIN users
    if (currentUser && currentUser.role !== 'SUPER_ADMIN') {
      where.companyId = currentUser.companyId;
    }

    // 2. Enforce Property isolation
    if (allowedLocationIds && allowedLocationIds.length > 0) {
      where.assignments = {
        some: {
          locationId: { in: allowedLocationIds },
        },
      };
    } else if (currentUser && currentUser.role !== 'SUPER_ADMIN' && currentUser.role !== 'OWNER' && currentUser.role !== 'CLIENT_ADMIN') {
      const userAssigned = currentUser.assignedLocationIds || [];
      where.assignments = {
        some: {
          locationId: { in: userAssigned },
        },
      };
    }

    const users = await this.prisma.user.findMany({
      where,
      select: {
        ...USER_SAFE_SELECT,
        pinCodeHash: true,
      },
      orderBy: { firstName: 'asc' },
    });

    return users.map((u) => {
      const { pinCodeHash, ...safeUser } = u;
      const primaryLocId = u.assignments?.[0]?.location?.id || null;

      // Apply service-level financial masking (strips hourlyRate if unauthorized)
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
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        ...USER_SAFE_SELECT,
        pinCodeHash: true,
      },
    });
    if (!user) throw new NotFoundException(`Staff member ${id} not found.`);

    // Enforce Company isolation
    if (currentUser) {
      this.authzService.assertCompanyAccess(currentUser, user.companyId);

      const locationIds = user.assignments?.map((a: any) => a.locationId) || [];
      const primaryLocId = locationIds[0];
      if (primaryLocId) {
        this.authzService.assertPropertyAccess(currentUser, primaryLocId, user.companyId);
      }
    }

    const { pinCodeHash, ...safeUser } = user;
    const primaryLocId = user.assignments?.[0]?.location?.id || undefined;
    const masked = this.authzService.maskFinancialFields(safeUser, currentUser, primaryLocId);

    return {
      ...masked,
      hasPin: !!pinCodeHash,
      pinCode: null, // Generic single fetch NEVER leaks decrypted PIN automatically
    };
  }

  /**
   * Explicit action endpoint to retrieve employee's decrypted 6-digit PIN.
   * Requires VIEW_EMPLOYEE_PIN permission + Company/Property authorization.
   */
  async getDecryptedPin(id: string, currentUser: any) {
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
      },
    });
    if (!user) throw new NotFoundException(`Staff member ${id} not found.`);

    const empLocationIds = user.assignments?.map((a: any) => a.locationId) || [];
    const primaryLocId = empLocationIds[0];

    // Assert Company isolation & Property authorization
    this.authzService.assertCompanyAccess(currentUser, user.companyId);
    if (primaryLocId) {
      this.authzService.assertPropertyAccess(currentUser, primaryLocId, user.companyId);
    }

    // Assert VIEW_EMPLOYEE_PIN permission
    this.authzService.assertPermission(currentUser, Permission.VIEW_EMPLOYEE_PIN, primaryLocId);

    const decryptedPin = decryptPin(user.pinCodeEncrypted);

    // Security Audit Log (Audits access WITHOUT logging the raw PIN)
    await this.prisma.auditLog.create({
      data: {
        actorId: currentUser.id,
        action: 'VIEW_EMPLOYEE_PIN',
        targetEntity: `User:${id}`,
        details: {
          targetEmployeeNumber: user.employeeNumber,
          targetName: `${user.firstName} ${user.lastName}`,
          propertyId: primaryLocId || null,
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
   * Requires RESET_EMPLOYEE_PIN permission + Company/Property authorization.
   */
  async resetPin(id: string, newPinCode: string, currentUser: any) {
    if (!newPinCode || newPinCode.length !== 6 || !/^\d{6}$/.exec(newPinCode)) {
      throw new BadRequestException('PIN code must be exactly 6 digits.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        companyId: true,
        employeeNumber: true,
        firstName: true,
        lastName: true,
        assignments: { select: { locationId: true } },
      },
    });
    if (!user) throw new NotFoundException(`Staff member ${id} not found.`);

    const empLocationIds = user.assignments?.map((a: any) => a.locationId) || [];
    const primaryLocId = empLocationIds[0];

    // Assert Company isolation & Property authorization
    this.authzService.assertCompanyAccess(currentUser, user.companyId);
    if (primaryLocId) {
      this.authzService.assertPropertyAccess(currentUser, primaryLocId, user.companyId);
    }

    // Assert RESET_EMPLOYEE_PIN permission
    this.authzService.assertPermission(currentUser, Permission.RESET_EMPLOYEE_PIN, primaryLocId);

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
          propertyId: primaryLocId || null,
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
      select: USER_SAFE_SELECT,
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
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        companyId: true,
        role: true,
        pinCodeHash: true,
        pinCodeEncrypted: true,
        assignments: { select: { locationId: true } },
      },
    });
    if (!user) throw new NotFoundException(`Staff member ${id} not found.`);

    if (currentUser) {
      this.authzService.assertCompanyAccess(currentUser, user.companyId);
      this.authzService.assertPrivilegeEscalationSafety(currentUser, dto.role, dto.permissions);

      const locationIds = user.assignments?.map((a: any) => a.locationId) || [];
      if (locationIds[0]) {
        this.authzService.assertPropertyAccess(currentUser, locationIds[0], user.companyId);
      }
      if (dto.locationId) {
        this.authzService.assertPropertyAccess(currentUser, dto.locationId, user.companyId);
      }
    }

    const pinCodeHash = dto.pinCode ? await bcrypt.hash(dto.pinCode, 10) : user.pinCodeHash;
    const pinCodeEncrypted = dto.pinCode ? encryptPin(dto.pinCode) : user.pinCodeEncrypted;

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
      select: USER_SAFE_SELECT,
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

    const primaryLocId = updated.assignments?.[0]?.location?.id || undefined;
    const masked = this.authzService.maskFinancialFields(updated, currentUser, primaryLocId);

    return {
      ...masked,
      hasPin: !!pinCodeHash,
      pinCode: null,
    };
  }

  async remove(id: string, currentUser?: any) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        companyId: true,
        firstName: true,
        lastName: true,
        assignments: { select: { locationId: true } },
      },
    });
    if (!user) throw new NotFoundException(`Staff member ${id} not found.`);

    if (currentUser) {
      this.authzService.assertCompanyAccess(currentUser, user.companyId);
      const locationIds = user.assignments?.map((a: any) => a.locationId) || [];
      if (locationIds[0]) {
        this.authzService.assertPropertyAccess(currentUser, locationIds[0], user.companyId);
      }
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

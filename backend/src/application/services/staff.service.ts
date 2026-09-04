import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@infrastructure/persistence/prisma/prisma.service';
import { assertLocationAccess } from '@infrastructure/auth/location-access.util';
import { encryptPin, decryptPin } from '@infrastructure/security/pin-encryption.util';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

const USER_SAFE_SELECT = {
  id: true,
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
      location: { select: { id: true, name: true, locationCode: true } },
    },
  },
};

/**
 * Checks whether the current requesting user is authorized to receive decrypted PINs
 * for an employee belonging to the given employeeLocationIds.
 *
 * Rules:
 * 1. SUPER_ADMIN: Authorized for all staff members across all locations.
 * 2. LOCATION_ADMIN: Authorized ONLY for staff members assigned to a location matching
 *    the admin's assigned location IDs.
 * 3. SUPERVISOR / Non-admin roles: NOT authorized to receive PINs.
 */
function isPinAccessAuthorized(currentUser?: any, employeeLocationIds: string[] = []): boolean {
  if (!currentUser || !currentUser.role) return false;

  if (currentUser.role === 'SUPER_ADMIN') {
    return true;
  }

  if (currentUser.role === 'LOCATION_ADMIN') {
    const adminLocationIds: string[] = currentUser.assignedLocationIds || currentUser.locationIds || [];
    if (adminLocationIds.length === 0) return false;
    return employeeLocationIds.some((locId) => adminLocationIds.includes(locId));
  }

  return false;
}

@Injectable()
export class StaffService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(allowedLocationIds?: string[], currentUser?: any) {
    const where: any = { status: 'ACTIVE' };
    if (allowedLocationIds && allowedLocationIds.length > 0) {
      where.assignments = {
        some: {
          locationId: { in: allowedLocationIds },
        },
      };
    }

    const users = await this.prisma.user.findMany({
      where,
      select: {
        ...USER_SAFE_SELECT,
        pinCodeHash: true,
        pinCodeEncrypted: true,
      },
      orderBy: { firstName: 'asc' },
    });

    return users.map((u) => {
      const { pinCodeHash, pinCodeEncrypted, ...safeUser } = u;
      const empLocationIds = u.assignments?.map((a: any) => a.locationId) || [];
      const canViewPin = isPinAccessAuthorized(currentUser, empLocationIds);
      const decryptedPin = canViewPin ? decryptPin(pinCodeEncrypted) : null;

      return {
        ...safeUser,
        hasPin: !!pinCodeHash,
        pinCode: decryptedPin,
        locationId: u.assignments?.[0]?.location?.id || null,
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
        pinCodeEncrypted: true,
      },
    });
    if (!user) throw new NotFoundException(`Staff member ${id} not found.`);

    const locationIds = user.assignments?.map((a: any) => a.locationId) || [];
    if (currentUser) {
      assertLocationAccess(currentUser, locationIds);
    }

    const { pinCodeHash, pinCodeEncrypted, ...safeUser } = user;
    const canViewPin = isPinAccessAuthorized(currentUser, locationIds);
    const decryptedPin = canViewPin ? decryptPin(pinCodeEncrypted) : null;

    return {
      ...safeUser,
      hasPin: !!pinCodeHash,
      pinCode: decryptedPin,
    };
  }

  async create(dto: any, currentUser?: any) {
    if (currentUser && dto.locationId) {
      assertLocationAccess(currentUser, dto.locationId);
    }

    const rawPassword = dto.password || crypto.randomBytes(24).toString('hex');
    const passwordHash = await bcrypt.hash(rawPassword, 10);
    const pinCodeHash = dto.pinCode ? await bcrypt.hash(dto.pinCode, 10) : null;
    const pinCodeEncrypted = dto.pinCode ? encryptPin(dto.pinCode) : null;

    const user = await this.prisma.user.create({
      data: {
        employeeNumber: dto.employeeNumber || `EMP-${Date.now()}`,
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email || `${dto.firstName.toLowerCase()}.${dto.lastName.toLowerCase()}.${Date.now()}@nexustaff.com`,
        passwordHash,
        jobPositionCode: dto.jobPositionCode || 'STAFF',
        pinCodeHash,
        pinCodeEncrypted,
        preferredLanguage: dto.preferredLanguage || 'es',
        role: 'WORKER',
        status: 'ACTIVE',
      },
      select: USER_SAFE_SELECT,
    });

    if (dto.locationId) {
      await this.prisma.userLocationAssignment.create({
        data: { userId: user.id, locationId: dto.locationId },
      });
    }

    const canViewPin = isPinAccessAuthorized(currentUser, dto.locationId ? [dto.locationId] : []);

    return {
      ...user,
      hasPin: !!pinCodeHash,
      pinCode: canViewPin ? dto.pinCode : null,
    };
  }

  async update(id: string, dto: any, currentUser?: any) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        pinCodeHash: true,
        pinCodeEncrypted: true,
        assignments: { select: { locationId: true } },
      },
    });
    if (!user) throw new NotFoundException(`Staff member ${id} not found.`);

    if (currentUser) {
      const locationIds = user.assignments?.map((a: any) => a.locationId) || [];
      assertLocationAccess(currentUser, locationIds);
      if (dto.locationId) {
        assertLocationAccess(currentUser, dto.locationId);
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

    const updatedLocationIds = updated.assignments?.map((a: any) => a.locationId) || [];
    const canViewPin = isPinAccessAuthorized(currentUser, updatedLocationIds);
    const decryptedPin = canViewPin ? (dto.pinCode || decryptPin(pinCodeEncrypted)) : null;

    return {
      ...updated,
      hasPin: !!pinCodeHash,
      pinCode: decryptedPin,
    };
  }

  async remove(id: string, currentUser?: any) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        assignments: { select: { locationId: true } },
      },
    });
    if (!user) throw new NotFoundException(`Staff member ${id} not found.`);

    if (currentUser) {
      const locationIds = user.assignments?.map((a: any) => a.locationId) || [];
      assertLocationAccess(currentUser, locationIds);
    }

    await this.prisma.user.update({ where: { id }, data: { status: 'TERMINATED' } });
    return { message: `Staff member ${user.firstName} ${user.lastName} removed successfully.` };
  }
}

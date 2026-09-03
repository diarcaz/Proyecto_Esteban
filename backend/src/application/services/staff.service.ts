import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@infrastructure/persistence/prisma/prisma.service';
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

@Injectable()
export class StaffService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(allowedLocationIds?: string[]) {
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
      },
      orderBy: { firstName: 'asc' },
    });

    return users.map((u) => {
      const { pinCodeHash, ...safeUser } = u;
      return {
        ...safeUser,
        hasPin: !!pinCodeHash,
        locationId: u.assignments?.[0]?.location?.id || null,
        locationCode: u.assignments?.[0]?.location?.locationCode || null,
      };
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: USER_SAFE_SELECT,
    });
    if (!user) throw new NotFoundException(`Staff member ${id} not found.`);
    return user;
  }

  async create(dto: any) {
    const rawPassword = dto.password || crypto.randomBytes(24).toString('hex');
    const passwordHash = await bcrypt.hash(rawPassword, 10);
    const pinCodeHash = dto.pinCode ? await bcrypt.hash(dto.pinCode, 10) : null;

    const user = await this.prisma.user.create({
      data: {
        employeeNumber: dto.employeeNumber || `EMP-${Date.now()}`,
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email || `${dto.firstName.toLowerCase()}.${dto.lastName.toLowerCase()}.${Date.now()}@nexustaff.com`,
        passwordHash,
        jobPositionCode: dto.jobPositionCode || 'STAFF',
        pinCodeHash,
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

    return user;
  }

  async update(id: string, dto: any) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { id: true, pinCodeHash: true } });
    if (!user) throw new NotFoundException(`Staff member ${id} not found.`);

    const pinCodeHash = dto.pinCode ? await bcrypt.hash(dto.pinCode, 10) : user.pinCodeHash;

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        firstName: dto.firstName ?? undefined,
        lastName: dto.lastName ?? undefined,
        jobPositionCode: dto.jobPositionCode ?? undefined,
        pinCodeHash,
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

    return updated;
  }

  async remove(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { id: true, firstName: true, lastName: true } });
    if (!user) throw new NotFoundException(`Staff member ${id} not found.`);

    await this.prisma.user.update({ where: { id }, data: { status: 'TERMINATED' } });
    return { message: `Staff member ${user.firstName} ${user.lastName} removed successfully.` };
  }
}

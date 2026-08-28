import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@infrastructure/persistence/prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class StaffService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const users = await this.prisma.user.findMany({
      where: { status: 'ACTIVE' },
      include: {
        assignments: {
          include: {
            location: { select: { id: true, name: true, locationCode: true } },
          },
          take: 1,
        },
      },
      orderBy: { firstName: 'asc' },
    });

    return users.map((u) => ({
      id: u.id,
      employeeNumber: u.employeeNumber,
      firstName: u.firstName,
      lastName: u.lastName,
      jobPositionCode: u.jobPositionCode,
      pinCode: u.pinCode,
      preferredLanguage: u.preferredLanguage || 'es',
      locationId: u.assignments?.[0]?.location?.id || null,
      locationCode: u.assignments?.[0]?.location?.locationCode || null,
    }));
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        assignments: {
          include: {
            location: { select: { id: true, name: true, locationCode: true } },
          },
        },
      },
    });
    if (!user) throw new NotFoundException(`Staff member ${id} not found.`);
    return user;
  }

  async create(dto: any) {
    // Check PIN uniqueness
    if (dto.pinCode) {
      const existing = await this.prisma.user.findUnique({ where: { pinCode: dto.pinCode } });
      if (existing) throw new BadRequestException(`PIN code ${dto.pinCode} is already assigned to another staff member.`);
    }

    const defaultPassword = dto.password || 'NexuStaff2026!';
    const passwordHash = await bcrypt.hash(defaultPassword, 10);
    const pinCodeHash = dto.pinCode ? await bcrypt.hash(dto.pinCode, 10) : null;

    const user = await this.prisma.user.create({
      data: {
        employeeNumber: dto.employeeNumber || `EMP-${Date.now()}`,
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email || `${dto.firstName.toLowerCase()}.${dto.lastName.toLowerCase()}.${Date.now()}@nexustaff.com`,
        passwordHash,
        jobPositionCode: dto.jobPositionCode || 'STAFF',
        pinCode: dto.pinCode || null,
        pinCodeHash,
        preferredLanguage: dto.preferredLanguage || 'es',
        role: 'WORKER',
        status: 'ACTIVE',
      },
    });

    // Assign to location if provided
    if (dto.locationId) {
      await this.prisma.userLocationAssignment.create({
        data: { userId: user.id, locationId: dto.locationId },
      });
    }

    return user;
  }

  async update(id: string, dto: any) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException(`Staff member ${id} not found.`);

    // Check PIN uniqueness (exclude self)
    if (dto.pinCode && dto.pinCode !== user.pinCode) {
      const existing = await this.prisma.user.findFirst({
        where: { pinCode: dto.pinCode, NOT: { id } },
      });
      if (existing) throw new BadRequestException(`PIN code ${dto.pinCode} is already assigned to another staff member.`);
    }

    const pinCodeHash = dto.pinCode ? await bcrypt.hash(dto.pinCode, 10) : user.pinCodeHash;

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        firstName: dto.firstName ?? user.firstName,
        lastName: dto.lastName ?? user.lastName,
        jobPositionCode: dto.jobPositionCode ?? user.jobPositionCode,
        pinCode: dto.pinCode ?? user.pinCode,
        pinCodeHash,
        preferredLanguage: dto.preferredLanguage ?? user.preferredLanguage,
      },
    });

    // Re-assign location if changed
    if (dto.locationId) {
      await this.prisma.userLocationAssignment.deleteMany({ where: { userId: id } });
      await this.prisma.userLocationAssignment.create({
        data: { userId: id, locationId: dto.locationId },
      });
    }

    return updated;
  }

  async remove(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException(`Staff member ${id} not found.`);

    await this.prisma.user.update({ where: { id }, data: { status: 'TERMINATED' } });
    return { message: `Staff member ${user.firstName} ${user.lastName} removed successfully.` };
  }
}

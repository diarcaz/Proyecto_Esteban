import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@infrastructure/persistence/prisma/prisma.service';
import { assertLocationAccess } from '@infrastructure/auth/location-access.util';

@Injectable()
export class LocationService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(allowedLocationIds?: string[]) {
    const where: any = {};
    if (allowedLocationIds && allowedLocationIds.length > 0) {
      where.id = { in: allowedLocationIds };
    }

    const locs = await this.prisma.location.findMany({
      where,
      include: {
        _count: { select: { assignments: true } },
      },
      orderBy: { name: 'asc' },
    });

    return locs.map((l) => ({
      id: l.id,
      name: l.name,
      code: l.locationCode,
      address: l.address,
      city: l.timezone,
      activeStaffCount: l._count.assignments,
      kioskCode: l.locationCode.split('-')[1] || l.locationCode,
    }));
  }

  async create(dto: any) {
    let companyId = dto.companyId;
    if (!companyId) {
      const defaultCompany = await this.prisma.company.findFirst();
      if (defaultCompany) {
        companyId = defaultCompany.id;
      } else {
        const createdComp = await this.prisma.company.create({
          data: { name: 'NexuStaff Enterprise Corp', taxId: 'TAX-99887766' },
        });
        companyId = createdComp.id;
      }
    }

    const location = await this.prisma.location.create({
      data: {
        companyId,
        name: dto.name,
        address: dto.address,
        timezone: dto.city || 'America/Merida',
        locationCode: dto.code || `LOC-${Date.now()}`,
      },
    });
    return location;
  }

  async update(id: string, dto: any, currentUser?: any) {
    const loc = await this.prisma.location.findUnique({ where: { id } });
    if (!loc) throw new NotFoundException(`Location ${id} not found.`);

    if (currentUser) {
      assertLocationAccess(currentUser, loc.id);
    }

    return this.prisma.location.update({
      where: { id },
      data: {
        name: dto.name ?? loc.name,
        address: dto.address ?? loc.address,
        timezone: dto.city ?? loc.timezone,
      },
    });
  }

  async remove(id: string, currentUser?: any) {
    const loc = await this.prisma.location.findUnique({ where: { id } });
    if (!loc) throw new NotFoundException(`Location ${id} not found.`);

    if (currentUser) {
      assertLocationAccess(currentUser, loc.id);
    }

    await this.prisma.location.delete({ where: { id } });
    return { message: `Location ${loc.name} deleted successfully.` };
  }
}

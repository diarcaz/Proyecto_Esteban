import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '@infrastructure/persistence/prisma/prisma.service';
import { AuthorizationService } from '@domain/security/authorization.service';

@Injectable()
export class LocationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authzService: AuthorizationService,
  ) {}

  async findAll(allowedLocationIds?: string[], currentUser?: any) {
    const where: any = {};

    // 1. Enforce Company isolation for non-SUPER_ADMIN
    if (currentUser && currentUser.role !== 'SUPER_ADMIN') {
      if (currentUser.companyId) {
        where.companyId = currentUser.companyId;
      }
    }

    // 2. Enforce Property scope for non-OWNER / non-SUPER_ADMIN
    if (currentUser && currentUser.role !== 'SUPER_ADMIN' && currentUser.role !== 'OWNER' && currentUser.role !== 'CLIENT_ADMIN') {
      const assignedIds = currentUser.assignedLocationIds || [];
      if (allowedLocationIds && allowedLocationIds.length > 0) {
        const filtered = allowedLocationIds.filter((id) => assignedIds.includes(id));
        where.id = { in: filtered.length > 0 ? filtered : ['none'] };
      } else {
        where.id = { in: assignedIds.length > 0 ? assignedIds : ['none'] };
      }
    } else if (allowedLocationIds && allowedLocationIds.length > 0) {
      where.id = { in: allowedLocationIds };
    }

    const locs = await this.prisma.location.findMany({
      where,
      include: {
        _count: { select: { assignments: true } },
        operationalConfig: true,
      },
      orderBy: { name: 'asc' },
    });

    return locs.map((l) => ({
      id: l.id,
      companyId: l.companyId,
      name: l.name,
      code: l.locationCode,
      address: l.address,
      city: l.timezone,
      weekStartDay: l.operationalConfig?.weekStartDay || 'MONDAY',
      maxShiftDurationMinutes: l.operationalConfig?.maxShiftDurationMinutes || 960,
      activeStaffCount: l._count.assignments,
      kioskCode: l.locationCode.split('-')[1] || l.locationCode,
    }));
  }

  async create(dto: any, currentUser?: any) {
    let companyId = currentUser && currentUser.role !== 'SUPER_ADMIN' ? currentUser.companyId : dto.companyId;

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

    if (currentUser) {
      this.authzService.assertCompanyAccess(currentUser, companyId);
    }

    const location = await this.prisma.location.create({
      data: {
        companyId,
        name: dto.name,
        address: dto.address,
        timezone: dto.city || 'America/Merida',
        locationCode: dto.code || `LOC-${Date.now()}`,
        operationalConfig: {
          create: {
            weekStartDay: dto.weekStartDay || 'MONDAY',
            payrollFrequency: dto.payrollFrequency || 'WEEKLY',
            invoiceFrequency: dto.invoiceFrequency || 'WEEKLY',
            maxShiftDurationMinutes: dto.maxShiftDurationMinutes || 960,
          },
        },
      },
      include: {
        operationalConfig: true,
      },
    });

    return location;
  }

  async update(id: string, dto: any, currentUser?: any) {
    const loc = await this.prisma.location.findUnique({
      where: { id },
      include: { operationalConfig: true },
    });
    if (!loc) throw new NotFoundException(`Location ${id} not found.`);

    if (currentUser) {
      this.authzService.assertCompanyAccess(currentUser, loc.companyId);
      this.authzService.assertPropertyAccess(currentUser, loc.id, loc.companyId);
    }

    return this.prisma.location.update({
      where: { id },
      data: {
        name: dto.name ?? loc.name,
        address: dto.address ?? loc.address,
        timezone: dto.city ?? loc.timezone,
        operationalConfig: {
          upsert: {
            create: {
              weekStartDay: dto.weekStartDay || 'MONDAY',
              maxShiftDurationMinutes: dto.maxShiftDurationMinutes || 960,
            },
            update: {
              weekStartDay: dto.weekStartDay ?? undefined,
              maxShiftDurationMinutes: dto.maxShiftDurationMinutes ?? undefined,
            },
          },
        },
      },
      include: {
        operationalConfig: true,
      },
    });
  }

  async remove(id: string, currentUser?: any) {
    const loc = await this.prisma.location.findUnique({ where: { id } });
    if (!loc) throw new NotFoundException(`Location ${id} not found.`);

    if (currentUser) {
      this.authzService.assertCompanyAccess(currentUser, loc.companyId);
      this.authzService.assertPropertyAccess(currentUser, loc.id, loc.companyId);
    }

    await this.prisma.location.delete({ where: { id } });
    return { message: `Location ${loc.name} deleted successfully.` };
  }
}

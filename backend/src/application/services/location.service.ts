import { resolvePropertyReadScope } from '@domain/security/property-read-scope';
import { Permission } from '@domain/permissions/permission.enum';
import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@infrastructure/persistence/prisma/prisma.service';
import { AuthorizationService } from '@domain/security/authorization.service';

@Injectable()
export class LocationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authzService: AuthorizationService,
  ) {}

  async findAll(allowedLocationIds?: string[], currentUser?: any, query: any = {}, headers: any = {}) {
    const properties = await resolvePropertyReadScope(this.prisma, currentUser, query, headers, Permission.PROPERTY_VIEW);
    const where = { id: { in: properties.map(p => p.id) }, ...(currentUser.role === 'SUPER_ADMIN' ? {} : { companyId: currentUser.companyId }) };

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
      timezone: l.timezone,
      address: l.address,
      city: l.timezone,
      weekStartDay: l.operationalConfig?.weekStartDay || 'MONDAY',
      maxShiftDurationMinutes: l.operationalConfig?.maxShiftDurationMinutes || 960,
      activeStaffCount: l._count.assignments,
      kioskCode: l.locationCode.split('-')[1] || l.locationCode,
    }));
  }

  private validateTimezone(value: unknown): string {
    if (typeof value !== 'string' || !value.trim()) throw new BadRequestException('A valid IANA timezone is required.');
    try { new Intl.DateTimeFormat('en', { timeZone: value }); } catch { throw new BadRequestException('A valid IANA timezone is required.'); }
    return value;
  }

  async create(dto: any, currentUser?: any) {
    const companyId = currentUser && currentUser.role !== 'SUPER_ADMIN' ? currentUser.companyId : dto.companyId || currentUser?.companyId;

    if (!companyId) throw new BadRequestException('An explicit company is required.');

    if (currentUser) {
      this.authzService.assertCompanyAccess(currentUser, companyId);
    }

    const location = await this.prisma.location.create({
      data: {
        companyId,
        name: dto.name,
        address: dto.address,
        timezone: this.validateTimezone(dto.timezone ?? dto.city),
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
        timezone: this.validateTimezone(dto.timezone ?? dto.city ?? loc.timezone),
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

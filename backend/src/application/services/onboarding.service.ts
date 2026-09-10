import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@infrastructure/persistence/prisma/prisma.service';
import { AuthorizationService } from '@domain/security/authorization.service';
import { Permission } from '@domain/permissions/permission.enum';
import { encryptPin } from '@infrastructure/security/pin-encryption.util';
import { resolveEmployeeClockAssignment } from './employee-clock-context';
import { AssignmentDto, OnboardEmployeeDto, DepartmentDto, PositionDto } from '@adapters/dtos/onboarding.dtos';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService, private readonly authz: AuthorizationService) {}
  private async property(db: any, actor: any, id: string, permissions: Permission[]) {
    if (!actor || !['SUPER_ADMIN','OWNER','ADMIN','MANAGER','LOCATION_ADMIN','SUPERVISOR'].includes(actor.role)) throw new ForbiddenException('Administrator access required.');
    const property = await db.location.findUnique({ where: { id } });
    if (!property) throw new NotFoundException('Property not found.');
    this.authz.assertPropertyAccess(actor, id, property.companyId);
    if (!permissions.some(p => this.authz.hasPermission(actor, p, id, property.companyId))) throw new ForbiddenException('Missing permission for this property operation.');
    return property;
  }
  private async employee(db: any, actor: any, id: string) {
    if (!actor || !['SUPER_ADMIN','OWNER','ADMIN','MANAGER','LOCATION_ADMIN','SUPERVISOR'].includes(actor.role)) throw new ForbiddenException('Administrator access required.');
    const user = await db.user.findUnique({ where: { id }, include: { assignments: true, employeeAssignments: true } });
    if (!user) throw new NotFoundException('Employee not found.');
    this.authz.assertCanAccessEmployee(actor, user);
    return user;
  }
  private dates(dto: AssignmentDto) {
    const effectiveFrom = new Date(dto.effectiveFrom), effectiveUntil = dto.effectiveUntil ? new Date(dto.effectiveUntil) : null;
    if (!Number.isFinite(+effectiveFrom) || (effectiveUntil && (!Number.isFinite(+effectiveUntil) || effectiveUntil < effectiveFrom))) throw new BadRequestException('Invalid assignment effective dates.');
    return { effectiveFrom, effectiveUntil, active: dto.active ?? true };
  }
  private async context(db: any, dto: AssignmentDto) {
    const department = await db.department.findUnique({ where: { id: dto.departmentId } });
    const position = await db.position.findUnique({ where: { id: dto.positionId } });
    if (!department || department.locationId !== dto.propertyId) throw new BadRequestException('Department does not belong to the selected property.');
    if (!position || !position.active || position.locationId !== dto.propertyId || position.departmentId !== department.id) throw new BadRequestException('Position does not belong to the selected department/property or is inactive.');
    return { department, position };
  }
  private async insertAssignment(db: any, userId: string, dto: AssignmentDto) {
    const dates = this.dates(dto);
    // Caller holds the employee row lock. Serialize competing additions/deactivations.
    if (dates.active) {
      const overlaps = await db.employeeAssignment.findMany({ where: { userId, propertyId: dto.propertyId, active: true,
        ...(dates.effectiveUntil ? { effectiveFrom: { lte: dates.effectiveUntil } } : {}),
        OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: dates.effectiveFrom } }] } });
      // Reject even identical overlaps: the beta does not need duplicate active contexts.
      if (overlaps.length) throw new BadRequestException('An active assignment already overlaps these dates at this property. End or deactivate it first.');
    }
    const assignment = await db.employeeAssignment.create({ data: { userId, propertyId: dto.propertyId, departmentId: dto.departmentId, positionId: dto.positionId, ...dates } });
    // Secondary compatibility record for existing directory/admin access queries, never clock authority.
    await db.userLocationAssignment.upsert({ where: { userId_locationId: { userId, locationId: dto.propertyId } }, create: { userId, locationId: dto.propertyId }, update: {} });
    return { id: assignment.id };
  }
  async catalog(propertyId: string, actor: any) {
    const p = await this.property(this.prisma, actor, propertyId, [Permission.STAFF_VIEW, Permission.STAFF_CREATE, Permission.STAFF_EDIT, Permission.PROPERTY_MANAGE]);
    return {
      departments: await this.prisma.department.findMany({ where: { locationId: propertyId }, select: { id: true, name: true, deptCode: true }, orderBy: { name: 'asc' } }),
      positions: await this.prisma.position.findMany({ where: { locationId: propertyId, active: true }, select: { id: true, title: true, code: true, departmentId: true }, orderBy: { title: 'asc' } }),
      canManage: this.authz.hasPermission(actor, Permission.PROPERTY_MANAGE, propertyId, p.companyId),
    };
  }
  async createDepartment(propertyId: string, dto: DepartmentDto, actor: any) {
    await this.property(this.prisma, actor, propertyId, [Permission.PROPERTY_MANAGE]);
    if (!dto.name.trim() || !dto.code.trim()) throw new BadRequestException('Name and code are required.');
    return this.prisma.department.create({ data: { locationId: propertyId, name: dto.name.trim(), deptCode: dto.code.trim() }, select: { id: true, name: true } });
  }
  async createPosition(propertyId: string, dto: PositionDto, actor: any) {
    await this.property(this.prisma, actor, propertyId, [Permission.PROPERTY_MANAGE]);
    const department = await this.prisma.department.findUnique({ where: { id: dto.departmentId } });
    if (!department || department.locationId !== propertyId) throw new BadRequestException('Department does not belong to this property.');
    if (!dto.name.trim() || !dto.code.trim()) throw new BadRequestException('Name and code are required.');
    return this.prisma.position.create({ data: { locationId: propertyId, departmentId: dto.departmentId, title: dto.name.trim(), code: dto.code.trim() }, select: { id: true, title: true } });
  }
  async create(dto: OnboardEmployeeDto, actor: any) {
    if (dto.role && dto.role !== 'WORKER') throw new BadRequestException('Normal employee onboarding requires WORKER.');
    if (!dto.firstName.trim() || !dto.lastName.trim() || !/^EMP-[A-Za-z0-9-]{1,40}$/.test(dto.employeeNumber) || !/^\d{6}$/.test(dto.pinCode)) throw new BadRequestException('Valid employee identity and six-digit PIN are required.');
    const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
    const pinCodeHash = await bcrypt.hash(dto.pinCode, 10), pinCodeEncrypted = encryptPin(dto.pinCode);
    return this.prisma.$transaction(async tx => {
      const property = await this.property(tx, actor, dto.propertyId, [Permission.STAFF_CREATE]);
      const { position } = await this.context(tx, dto);
      const user = await tx.user.create({ data: { companyId: property.companyId, firstName: dto.firstName.trim(), lastName: dto.lastName.trim(), employeeNumber: dto.employeeNumber,
        email: dto.email || crypto.randomUUID() + '@employees.invalid', passwordHash, pinCodeHash, pinCodeEncrypted, role: 'WORKER', status: dto.status || 'ACTIVE', jobPositionCode: position.code }, select: { id: true } });
      await this.insertAssignment(tx, user.id, { ...dto, active: true });
      await tx.auditLog.create({ data: { actorId: actor.id, action: 'EMPLOYEE_ONBOARDED', targetEntity: 'User:' + user.id, details: { propertyId: dto.propertyId, departmentId: dto.departmentId, positionId: dto.positionId } } });
      return user;
    });
  }
  async add(userId: string, dto: AssignmentDto, actor: any) {
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
      const user = await this.employee(tx, actor, userId);
      const property = await this.property(tx, actor, dto.propertyId, [Permission.STAFF_EDIT]);
      if (user.companyId !== property.companyId) throw new ForbiddenException('Employee and property must belong to the same company.');
      if (user.role !== 'WORKER') throw new BadRequestException('Beta operational assignments are for WORKER accounts.');
      await this.context(tx, dto);
      const result = await this.insertAssignment(tx, userId, dto);
      await tx.auditLog.create({ data: { actorId: actor.id, action: 'EMPLOYEE_ASSIGNMENT_ADDED', targetEntity: 'EmployeeAssignment:' + result.id, details: { userId, propertyId: dto.propertyId } } });
      return result;
    });
  }
  async deactivate(userId: string, assignmentId: string, actor: any) {
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
      await this.employee(tx, actor, userId);
      const assignment = await tx.employeeAssignment.findUnique({ where: { id: assignmentId } });
      if (!assignment || assignment.userId !== userId) throw new NotFoundException('Assignment not found.');
      await this.property(tx, actor, assignment.propertyId, [Permission.STAFF_EDIT]);
      if (await tx.workShift.findFirst({ where: { userId, locationId: assignment.propertyId, status: 'OPEN' }, select: { id: true } })) throw new BadRequestException('Close the existing work shift before deactivating this assignment.');
      await tx.employeeAssignment.update({ where: { id: assignmentId }, data: { active: false } });
      await tx.auditLog.create({ data: { actorId: actor.id, action: 'EMPLOYEE_ASSIGNMENT_DEACTIVATED', targetEntity: 'EmployeeAssignment:' + assignmentId, details: { userId } } });
      return { success: true };
    });
  }
  async details(userId: string, actor: any) {
    const user = await this.employee(this.prisma, actor, userId);
    const rows = await this.prisma.employeeAssignment.findMany({ where: { userId }, include: { property: true, department: true, position: true }, orderBy: { effectiveFrom: 'desc' } });
    const visible = rows.filter(a => this.authz.hasPermission(actor, Permission.STAFF_VIEW, a.propertyId, a.property.companyId));
    const legacyIds = user.assignments.map(a => a.locationId);
    const properties = await this.prisma.location.findMany({ where: { id: { in: [...new Set([...rows.map(a => a.propertyId), ...legacyIds])] } } });
    const allowed = properties.filter(p => this.authz.hasPermission(actor, Permission.STAFF_VIEW, p.id, p.companyId));
    if (!allowed.length && !this.authz.hasCompanyPermission(actor, Permission.STAFF_VIEW, user.companyId)) throw new ForbiddenException('Staff view permission required.');
    const readiness = await Promise.all(allowed.map(async p => {
      let clockReady = false;
      try { await resolveEmployeeClockAssignment(this.prisma, userId, p.id, new Date()); clockReady = user.status === 'ACTIVE' && !!user.pinCodeHash; } catch {}
      return { propertyId: p.id, name: p.name, clockReady, canEdit: this.authz.hasPermission(actor, Permission.STAFF_EDIT, p.id, p.companyId) };
    }));
    return { id: user.id, firstName: user.firstName, lastName: user.lastName, employeeNumber: user.employeeNumber, status: user.status,
      readiness, canViewPin: allowed.some(p => this.authz.hasPermission(actor, Permission.VIEW_EMPLOYEE_PIN, p.id, p.companyId)), canResetPin: allowed.some(p => this.authz.hasPermission(actor, Permission.RESET_EMPLOYEE_PIN, p.id, p.companyId)),
      assignments: visible.map(a => ({ id: a.id, propertyId: a.propertyId, property: a.property.name, department: a.department.name, position: a.position.title, effectiveFrom: a.effectiveFrom, effectiveUntil: a.effectiveUntil, active: a.active })) };
  }
}

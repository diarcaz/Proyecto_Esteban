import { Injectable, ForbiddenException, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@infrastructure/persistence/prisma/prisma.service';
import { AuthorizationService } from '@domain/security/authorization.service';
import { Permission } from '@domain/permissions/permission.enum';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
export const ACCOUNT_ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'LOCATION_ADMIN', 'SUPERVISOR'];
const ORDER = ['SUPER_ADMIN', ...ACCOUNT_ROLES, 'WORKER'];
const include = { company: { select: { id: true, name: true } }, assignments: { select: { locationId: true } }, propertyAccess: { select: { propertyId: true, permissions: true, property: { select: { name: true, companyId: true } } } }, employeeAssignments: { select: { id: true } } };
const select = { id: true, companyId: true, firstName: true, lastName: true, email: true, role: true, status: true, permissions: true, updatedAt: true, ...include };
export function validateAdminPassword(password: string) {
    if (typeof password !== 'string' || password.length < 16 || Buffer.byteLength(password, 'utf8') > 72 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^a-zA-Z0-9]/.test(password))
        throw new BadRequestException('Use 16+ characters with uppercase, lowercase, number and symbol; maximum 72 UTF-8 bytes. Avoid common passwords.');
    if (/password|changeme|qwerty|123456|nexustaff/i.test(password))
        throw new BadRequestException({ code: 'PASSWORD_PREDICTABLE', message: 'Password rejected. Avoid common passwords and predictable sequences.' });
}
@Injectable()
export class AdminAccountsService {
    constructor(private readonly prisma: PrismaService, private readonly authz: AuthorizationService) { }
    private async actor(db: any, principal: any) {
        if (!principal?.id)
            throw new ForbiddenException('Administrative access required.');
        const user = await db.user.findUnique({ where: { id: principal.id }, select });
        if (!user || user.status !== 'ACTIVE' || !ORDER.includes(user.role) || user.role === 'WORKER')
            throw new ForbiddenException('Administrative access required.');
        return { ...user, assignedLocationIds: user.assignments.map((a: any) => a.locationId) };
    }
    private capable(actor: any, permission: Permission, property: any) { return this.authz.canAccessProperty(actor, property.id, property.companyId) && this.authz.hasPermission(actor, permission, property.id, property.companyId); }
    private rank(actor: any, role: string) { return ACCOUNT_ROLES.includes(role) && ORDER.indexOf(actor.role) < ORDER.indexOf(role); }
    private async properties(db: any, actor: any, permission: Permission) {
        const all = await db.location.findMany({ where: actor.role === 'SUPER_ADMIN' ? {} : { companyId: actor.companyId || '__none__' }, select: { id: true, name: true, companyId: true } });
        return all.filter((p: any) => this.capable(actor, permission, p));
    }
    private async allowed(db: any, actor: any, target: any, permission: Permission) {
        if (target.role === 'WORKER' || !this.authz.canAccessCompany(actor, target.companyId))
            return false;
        if (actor.role === 'SUPER_ADMIN')
            return true;
        if (!this.rank(actor, target.role))
            return false;
        const ids = [...new Set([...target.assignments.map((a: any) => a.locationId), ...target.propertyAccess.map((a: any) => a.propertyId)])];
        if (!ids.length)
            return actor.role === 'OWNER' && actor.companyId === target.companyId;
        const props = await db.location.findMany({ where: { id: { in: ids } }, select: { id: true, companyId: true } });
        return props.length === ids.length && props.every((p: any) => p.companyId === target.companyId && this.capable(actor, permission, p));
    }
    private safe(target: any, actor: any, canEdit: boolean) { return { id: target.id, firstName: target.firstName, lastName: target.lastName, email: target.email, role: target.role, companyId: target.companyId, companyName: target.company?.name || 'Platform', status: target.status, version: target.updatedAt.toISOString(), companyWide: target.role === 'OWNER', globalPermissions: target.permissions, grants: target.propertyAccess.map((g: any) => ({ propertyId: g.propertyId, name: g.property.name, permissions: g.permissions })), legacyPropertyIds: target.assignments.map((a: any) => a.locationId), canEdit: canEdit && target.id !== actor.id && target.role !== 'SUPER_ADMIN' && !target.employeeAssignments.length, canReset: canEdit && target.id !== actor.id && target.role !== 'SUPER_ADMIN' && ['SUPER_ADMIN', 'OWNER'].includes(actor.role) }; }
    async catalog(principal: any) {
        const actor = await this.actor(this.prisma, principal), view = await this.properties(this.prisma, actor, Permission.MANAGERS_VIEW), create = await this.properties(this.prisma, actor, Permission.MANAGERS_CREATE), edit = await this.properties(this.prisma, actor, Permission.MANAGERS_EDIT);
        if (!['SUPER_ADMIN', 'OWNER'].includes(actor.role) && !view.length && !create.length && !edit.length)
            throw new ForbiddenException('Account management permission required.');
        const properties = [...new Map([...view, ...create, ...edit].map(p => [p.id, p])).values()];
        const companies = await this.prisma.company.findMany({ where: actor.role === 'SUPER_ADMIN' ? {} : { id: actor.companyId || '__none__' }, select: { id: true, name: true } });
        return { companies, roles: ACCOUNT_ROLES.filter(r => this.rank(actor, r)), canCreate: ACCOUNT_ROLES.some(r => this.rank(actor, r)) && (['SUPER_ADMIN', 'OWNER'].includes(actor.role) || create.length > 0), properties: properties.map(p => ({ ...p, canCreate: create.some(c => c.id === p.id), canEdit: edit.some(c => c.id === p.id), permissions: Object.values(Permission).filter(permission => this.capable(actor, permission, p)) })), permissionNames: Object.values(Permission) };
    }
    async list(principal: any) {
        const actor = await this.actor(this.prisma, principal);
        await this.catalog(principal);
        const rows = await this.prisma.user.findMany({ where: { role: { not: 'WORKER' }, ...(actor.role === 'SUPER_ADMIN' ? {} : { companyId: actor.companyId || '__none__' }) }, select, orderBy: { email: 'asc' } });
        const result = [];
        for (const target of rows)
            if (await this.allowed(this.prisma, actor, target, Permission.MANAGERS_VIEW))
                result.push(this.safe(target, actor, await this.allowed(this.prisma, actor, target, Permission.MANAGERS_EDIT)));
        return result;
    }
    private async validate(db: any, actor: any, data: any, permission: Permission) {
        if (!this.rank(actor, data.role))
            throw new ForbiddenException('This role cannot be delegated.');
        const company = await db.company.findUnique({ where: { id: data.companyId }, select: { id: true } });
        if (!company || !this.authz.canAccessCompany(actor, company.id))
            throw new ForbiddenException('Company access denied.');
        if (!Array.isArray(data.grants) || data.grants.length > 200 || new Set(data.grants.map((g: any) => g.propertyId)).size !== data.grants.length)
            throw new BadRequestException('Provide distinct property grants.');
        if (data.role !== 'OWNER' && !data.grants.length)
            throw new BadRequestException('At least one authorized branch is required.');
        for (const grant of data.grants) {
            const property = await db.location.findUnique({ where: { id: grant.propertyId }, select: { id: true, companyId: true } });
            if (!property || property.companyId !== company.id || !this.capable(actor, permission, property))
                throw new ForbiddenException('Property delegation denied.');
            if (!Array.isArray(grant.permissions) || grant.permissions.some((p: any) => !Object.values(Permission).includes(p) || !this.capable(actor, p, property)))
                throw new ForbiddenException('Permission cannot be delegated.');
        }
        if (!data.grants.length && !['SUPER_ADMIN', 'OWNER'].includes(actor.role))
            throw new ForbiddenException('Company delegation required.');
    }
    private async existingPermissions(db: any, actor: any, target: any) {
        if (actor.role === 'SUPER_ADMIN' || actor.role === 'OWNER')
            return;
        const ids = [...new Set([...target.assignments.map((a: any) => a.locationId), ...target.propertyAccess.map((a: any) => a.propertyId)])];
        for (const id of ids) {
            const property = await db.location.findUnique({ where: { id }, select: { id: true, companyId: true } });
            const perms = [...target.permissions, ...target.propertyAccess.filter((p: any) => p.propertyId === id).flatMap((p: any) => p.permissions)];
            if (!property || perms.some(p => !this.capable(actor, p, property)))
                throw new ForbiddenException('Target privileges exceed your delegation authority.');
        }
    }
    private async grants(tx: any, id: string, grants: any[]) {
        await tx.userPropertyAccess.deleteMany({ where: { userId: id } });
        await tx.userLocationAssignment.deleteMany({ where: { userId: id } });
        for (const grant of grants) {
            await tx.userPropertyAccess.create({ data: { userId: id, propertyId: grant.propertyId, permissions: [...new Set<string>(grant.permissions)] } });
            await tx.userLocationAssignment.create({ data: { userId: id, locationId: grant.propertyId } });
        }
    }
    private audit(tx: any, actor: any, id: string, action: string, details: any = {}) { return tx.auditLog.create({ data: { actorId: actor.id, action, targetEntity: 'User:' + id, details } }); }
    async save(id: string | null, data: any, principal: any) {
        if (!id) {
            validateAdminPassword(data.password);
            if (typeof data.email !== 'string' || !/^\S+@\S+\.\S+$/.test(data.email.trim()))
                throw new BadRequestException('Valid email required.');
        }
        if (id && data.password !== undefined)
            throw new BadRequestException('Use the dedicated password reset operation.');
        if (!data.firstName?.trim() || !data.lastName?.trim() || !['ACTIVE', 'TERMINATED'].includes(data.status))
            throw new BadRequestException('Name and valid account status required.');
        try {
            return await this.prisma.$transaction(async (tx) => {
                await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(45104782)');
                const actor = await this.actor(tx, principal);
                const target = id ? await tx.user.findUnique({ where: { id }, select }) : null;
                if (id && !target)
                    throw new NotFoundException('Account not found.');
                if (target) {
                    if (target.id === actor.id || target.role === 'SUPER_ADMIN' || target.employeeAssignments.length || !await this.allowed(tx, actor, target, Permission.MANAGERS_EDIT))
                        throw new ForbiddenException('Account cannot be modified through this flow.');
                    if (data.companyId !== target.companyId)
                        throw new BadRequestException('Account company cannot be moved.');
                    if (data.version !== target.updatedAt.toISOString())
                        throw new ConflictException('Account changed. Reload before saving.');
                    await this.existingPermissions(tx, actor, target);
                }
                await this.validate(tx, actor, data, target ? Permission.MANAGERS_EDIT : Permission.MANAGERS_CREATE);
                const common = { firstName: data.firstName.trim(), lastName: data.lastName.trim(), role: data.role, status: data.status, permissions: [] };
                const result = target ? await tx.user.update({ where: { id }, data: common, select: { id: true } }) : await tx.user.create({ data: { ...common, companyId: data.companyId, email: data.email.trim().toLowerCase(), employeeNumber: 'ADM-' + randomUUID(), jobPositionCode: 'ADMINISTRATIVE', passwordHash: await bcrypt.hash(data.password, 12) }, select: { id: true } });
                await this.grants(tx, result.id, data.grants);
                if (!target)
                    await this.audit(tx, actor, result.id, 'ADMIN_ACCOUNT_CREATED', { companyId: data.companyId, role: data.role });
                else {
                    await this.audit(tx, actor, result.id, 'ADMIN_ACCOUNT_UPDATED');
                    if (target.role !== data.role)
                        await this.audit(tx, actor, result.id, 'ADMIN_ROLE_CHANGED', { from: target.role, to: data.role });
                    if (target.status !== data.status)
                        await this.audit(tx, actor, result.id, 'ADMIN_STATUS_CHANGED', { from: target.status, to: data.status });
                }
                await this.audit(tx, actor, result.id, 'ADMIN_PROPERTY_GRANTS_CHANGED', { grants: data.grants });
                return { id: result.id };
            }, { timeout: 15000 });
        }
        catch (error: any) {
            if (error?.code === 'P2002')
                throw new ConflictException('An account already uses those details.');
            throw error;
        }
    }
    async reset(id: string, password: string, version: string, principal: any) {
        validateAdminPassword(password);
        return this.prisma.$transaction(async (tx) => {
            await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(45104782)');
            const actor = await this.actor(tx, principal), target = await tx.user.findUnique({ where: { id }, select });
            if (!target || !['SUPER_ADMIN', 'OWNER'].includes(actor.role) || actor.id === id || target.role === 'SUPER_ADMIN' || target.role === 'WORKER' || !await this.allowed(tx, actor, target, Permission.MANAGERS_EDIT))
                throw new ForbiddenException('Password reset denied.');
            if (version !== target.updatedAt.toISOString())
                throw new ConflictException('Account changed. Reload before resetting.');
            await tx.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(password, 12) } });
            await this.audit(tx, actor, id, 'ADMIN_PASSWORD_RESET');
            return { success: true };
        });
    }
}

import { Injectable, ForbiddenException } from '@nestjs/common';
import { Permission } from '../permissions/permission.enum';

export interface AuthUserContext {
  id: string;
  email: string;
  role: string;
  companyId?: string | null;
  assignedLocationIds?: string[];
  permissions?: string[];
  propertyAccess?: Array<{
    propertyId: string;
    roleOverride?: string | null;
    permissions: string[];
  }>;
}

@Injectable()
export class AuthorizationService {
  /**
   * Verifies whether the user is authorized to access a given Company ID.
   * SUPER_ADMIN can access all companies.
   * All other users are strictly isolated to their assigned companyId.
   */
  canAccessCompany(user?: AuthUserContext, targetCompanyId?: string | null): boolean {
    if (!user) return false;
    if (user.role === 'SUPER_ADMIN') return true;
    if (!targetCompanyId || !user.companyId) return false;
    return user.companyId === targetCompanyId;
  }

  /**
   * Asserts Company isolation and throws ForbiddenException if unauthorized.
   */
  assertCompanyAccess(user?: AuthUserContext, targetCompanyId?: string | null): void {
    if (!this.canAccessCompany(user, targetCompanyId)) {
      throw new ForbiddenException('Access denied: You do not have permission to access resources belonging to another company.');
    }
  }

  /**
   * Verifies whether the user is authorized to access a given Property/Location ID.
   * SUPER_ADMIN: global access.
   * OWNER / CLIENT_ADMIN: access to all properties belonging to their companyId.
   * ADMIN / MANAGER / SUPERVISOR / WORKER: access ONLY to explicitly assigned properties.
   */
  canAccessProperty(user?: AuthUserContext, targetPropertyId?: string, propertyCompanyId?: string | null): boolean {
    if (!user || !targetPropertyId) return false;

    if (user.role === 'SUPER_ADMIN') return true;

    // Verify company isolation first
    if (propertyCompanyId && user.companyId && user.companyId !== propertyCompanyId) {
      return false;
    }

    // OWNER / CLIENT_ADMIN has default access to all properties within their own company
    if (user.role === 'OWNER' || user.role === 'CLIENT_ADMIN') {
      return true;
    }

    // Check direct property assignment in assignedLocationIds
    const assignedIds = user.assignedLocationIds || [];
    if (assignedIds.includes(targetPropertyId)) return true;

    // Check propertyAccess array
    const propertyAccessList = user.propertyAccess || [];
    return propertyAccessList.some((pa) => pa.propertyId === targetPropertyId);
  }

  /**
   * Asserts Property access and throws ForbiddenException if unauthorized.
   */
  assertPropertyAccess(user?: AuthUserContext, targetPropertyId?: string, propertyCompanyId?: string | null): void {
    if (!this.canAccessProperty(user, targetPropertyId, propertyCompanyId)) {
      throw new ForbiddenException(`Access denied for property scope '${targetPropertyId}'. You are not authorized for this property.`);
    }
  }

  /**
   * Resolves whether the user possesses a specific Permission (globally or property-scoped).
   */
  hasPermission(user?: AuthUserContext, permission?: Permission, targetPropertyId?: string): boolean {
    if (!user || !permission) return false;

    // SUPER_ADMIN has full permissions globally
    if (user.role === 'SUPER_ADMIN') return true;

    // Check global permissions on User model
    if (user.permissions && user.permissions.includes(permission)) {
      return true;
    }

    // OWNER / CLIENT_ADMIN has default management & financial permissions for non-superadmin operations within their tenant
    if (user.role === 'OWNER' || user.role === 'CLIENT_ADMIN') {
      return true;
    }

    // Check Property-scoped permissions
    if (targetPropertyId && user.propertyAccess) {
      const pa = user.propertyAccess.find((access) => access.propertyId === targetPropertyId);
      if (pa && pa.permissions && pa.permissions.includes(permission)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Asserts that the user possesses a required permission.
   */
  assertPermission(user?: AuthUserContext, permission?: Permission, targetPropertyId?: string): void {
    if (!this.hasPermission(user, permission, targetPropertyId)) {
      throw new ForbiddenException(`Required permission '${permission}' is missing for this operation.`);
    }
  }

  /**
   * Prevents privilege escalation during user creation or role/permission updates.
   * Non-SUPER_ADMIN users cannot grant roles or permissions beyond their own authority.
   */
  assertPrivilegeEscalationSafety(actor: AuthUserContext, targetRole?: string, targetPermissions?: string[]): void {
    if (actor.role === 'SUPER_ADMIN') return;

    if (targetRole === 'SUPER_ADMIN') {
      throw new ForbiddenException('Privilege escalation error: Non-SUPER_ADMIN users cannot assign the SUPER_ADMIN role.');
    }

    if (targetRole === 'OWNER' && actor.role !== 'OWNER') {
      throw new ForbiddenException('Privilege escalation error: Only an OWNER or SUPER_ADMIN can assign the OWNER role.');
    }

    if (targetPermissions && targetPermissions.length > 0) {
      const actorPermissions = actor.permissions || [];
      const unauthorizedPermissions = targetPermissions.filter((p) => !actorPermissions.includes(p));
      if (unauthorizedPermissions.length > 0 && actor.role !== 'OWNER') {
        throw new ForbiddenException(`Privilege escalation error: You cannot delegate permissions you do not possess (${unauthorizedPermissions.join(', ')}).`);
      }
    }
  }

  /**
   * Masks financial fields in data objects if the user lacks financial permissions.
   * Sensitive fields are omitted (never set to 0 or null).
   */
  maskFinancialFields<T extends Record<string, any>>(data: T, user?: AuthUserContext, targetPropertyId?: string): T {
    if (!data || typeof data !== 'object') return data;
    if (user?.role === 'SUPER_ADMIN') return data;

    const canViewPayRate = this.hasPermission(user, Permission.VIEW_PAY_RATE, targetPropertyId);
    const canViewBillRate = this.hasPermission(user, Permission.VIEW_BILL_RATE, targetPropertyId);
    const canViewMarkup = this.hasPermission(user, Permission.VIEW_MARKUP, targetPropertyId);

    const result = { ...data };

    if (!canViewPayRate) {
      delete result.hourlyRate;
      delete result.payRate;
      delete result.otPayRate;
      delete result.payRateApplied;
      delete result.otPayRateApplied;
      delete result.payrollTotal;
      delete result.totalPayrollCost;
    }

    if (!canViewBillRate) {
      delete result.billRate;
      delete result.otBillRate;
      delete result.billRateApplied;
      delete result.otBillRateApplied;
      delete result.billableTotal;
      delete result.totalBillable;
    }

    if (!canViewMarkup) {
      delete result.markupValue;
      delete result.markupType;
      delete result.markupDecimal;
    }

    return result;
  }

  /**
   * Resolves all active property IDs for an employee by combining:
   * 1. Legacy UserLocationAssignment.locationId
   * 2. Active EmployeeAssignment.propertyId (active === true, effectiveFrom <= now, effectiveUntil >= now || null)
   */
  getEmployeePropertyIds(employeeRecord: any): string[] {
    if (!employeeRecord) return [];
    const now = new Date();

    const legacyIds: string[] = (employeeRecord.assignments || [])
      .map((a: any) => a.locationId || a.location?.id)
      .filter(Boolean);

    const activeEmpAssignmentIds: string[] = (employeeRecord.employeeAssignments || [])
      .filter((ea: any) => {
        if (ea.active === false) return false;
        if (ea.effectiveFrom && new Date(ea.effectiveFrom) > now) return false;
        if (ea.effectiveUntil && new Date(ea.effectiveUntil) < now) return false;
        return true;
      })
      .map((ea: any) => ea.propertyId || ea.property?.id)
      .filter(Boolean);

    return Array.from(new Set([...legacyIds, ...activeEmpAssignmentIds]));
  }

  /**
   * Calculates the intersection between the employee's active properties and the requesting actor's authorized properties.
   */
  getSharedAuthorizedPropertyIds(
    actor?: AuthUserContext,
    employeePropertyIds: string[] = [],
    employeeCompanyId?: string | null,
  ): string[] {
    if (!actor) return [];
    if (actor.role === 'SUPER_ADMIN') return employeePropertyIds;

    // Enforce company isolation first
    if (employeeCompanyId && actor.companyId && actor.companyId !== employeeCompanyId) {
      return [];
    }

    if (actor.role === 'OWNER' || actor.role === 'CLIENT_ADMIN') {
      return employeePropertyIds;
    }

    return employeePropertyIds.filter((pId) => this.canAccessProperty(actor, pId, employeeCompanyId));
  }

  /**
   * Asserts that the requesting actor has property access to at least one of the employee's active properties.
   * Throws ForbiddenException if no shared authorized property exists.
   */
  assertCanAccessEmployee(actor: AuthUserContext, employeeRecord: any): string[] {
    this.assertCompanyAccess(actor, employeeRecord.companyId);

    const empPropertyIds = this.getEmployeePropertyIds(employeeRecord);
    const sharedPropIds = this.getSharedAuthorizedPropertyIds(actor, empPropertyIds, employeeRecord.companyId);

    if (sharedPropIds.length === 0 && actor.role !== 'SUPER_ADMIN' && actor.role !== 'OWNER' && actor.role !== 'CLIENT_ADMIN') {
      throw new ForbiddenException(
        `Access denied: You do not have property access authorization for any of employee ${employeeRecord.employeeNumber || employeeRecord.id || ''}'s assigned properties.`,
      );
    }

    return sharedPropIds;
  }

  /**
   * Filters an employee's assignment relations in response objects so non-SUPER_ADMIN / non-OWNER users
   * receive ONLY assignment records for properties they are authorized to view.
   */
  filterUserAssignments<T extends Record<string, any>>(userRecord: T, actor?: AuthUserContext, authorizedPropertyIds?: string[]): T {
    if (!userRecord || typeof userRecord !== 'object') return userRecord;
    if (!actor || actor.role === 'SUPER_ADMIN' || actor.role === 'OWNER' || actor.role === 'CLIENT_ADMIN') {
      return userRecord;
    }

    const allowedSet = new Set(authorizedPropertyIds || actor.assignedLocationIds || []);

    const filtered = { ...userRecord } as any;

    if (Array.isArray(filtered.assignments)) {
      filtered.assignments = filtered.assignments.filter((a: any) => allowedSet.has(a.locationId || a.location?.id));
    }

    if (Array.isArray(filtered.employeeAssignments)) {
      filtered.employeeAssignments = filtered.employeeAssignments.filter((ea: any) => allowedSet.has(ea.propertyId || ea.property?.id));
    }

    return filtered;
  }
}

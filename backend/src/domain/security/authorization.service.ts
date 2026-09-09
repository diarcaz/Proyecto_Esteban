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

export const PROPERTY_SCOPED_PERMISSIONS: ReadonlySet<Permission> = new Set([
  Permission.VIEW_PAY_RATE,
  Permission.VIEW_BILL_RATE,
  Permission.VIEW_MARKUP,
  Permission.VIEW_EMPLOYEE_PIN,
  Permission.RESET_EMPLOYEE_PIN,
  Permission.TIME_VIEW,
  Permission.TIME_EDIT,
  Permission.TIME_APPROVE,
]);

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
   * OWNER: access to all properties belonging to their companyId (NEVER foreign company).
   * ADMIN / MANAGER / SUPERVISOR / WORKER: access ONLY to explicitly assigned properties.
   *
   * SECURITY INVARIANT (Phase 3.2):
   * - propertyCompanyId is REQUIRED for all non-SUPER_ADMIN authorization decisions.
   * - Fails closed when company ownership cannot be established.
   * - OWNER receives access ONLY when user.companyId === propertyCompanyId.
   */
  canAccessProperty(user?: AuthUserContext, targetPropertyId?: string, propertyCompanyId?: string | null): boolean {
    if (!user || !targetPropertyId) return false;

    if (user.role === 'SUPER_ADMIN') return true;

    // FAIL CLOSED: propertyCompanyId MUST be provided for non-SUPER_ADMIN
    if (!propertyCompanyId) return false;

    // FAIL CLOSED: user MUST have a companyId
    if (!user.companyId) return false;

    // Company isolation: user.companyId must match propertyCompanyId
    if (user.companyId !== propertyCompanyId) return false;

    // OWNER has access to all properties within their own company (verified above)
    if (user.role === 'OWNER') {
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
   * Resolves whether the user possesses a specific Permission.
   *
   * SECURITY INVARIANT (Phase 3.2 Targeted Review):
   * - SUPER_ADMIN: global access.
   * - Non-SUPER_ADMIN: MUST have a valid companyId.
   * - Property-scoped permissions (or any call targeting a Property):
   *   - Require BOTH targetPropertyId AND server-resolved propertyCompanyId.
   *   - If targetPropertyId is provided without propertyCompanyId -> FAIL CLOSED (false).
   *   - If propertyCompanyId is provided but !== user.companyId -> FAIL CLOSED (false).
   *   - If user is OWNER:
   *     - Receives default permissions ONLY after tenant/property ownership has been established.
   *     - Context-free calls for property-scoped permissions (missing property/company) -> FAIL CLOSED (false).
   *     - Foreign property -> FAIL CLOSED (false).
   *     - Property without propertyCompanyId -> FAIL CLOSED (false).
   *     - Own property with confirmed propertyCompanyId === user.companyId -> ALLOWED (true).
   *   - Non-OWNER:
   *     - Evaluates canAccessProperty when propertyCompanyId is present.
   *     - Checks user.propertyAccess[targetPropertyId] or explicit user.permissions.
   * - Company-global operations:
   *   - Evaluated via hasCompanyPermission() or fall through for non-property-scoped permissions.
   */
  hasPermission(
    user?: AuthUserContext,
    permission?: Permission,
    targetPropertyId?: string,
    propertyCompanyId?: string | null,
  ): boolean {
    if (!user || !permission) return false;

    // SUPER_ADMIN has full permissions globally
    if (user.role === 'SUPER_ADMIN') return true;

    // FAIL CLOSED: Non-SUPER_ADMIN user MUST have a companyId
    if (!user.companyId) return false;

    // If propertyCompanyId is provided, fail closed on cross-company mismatch
    if (propertyCompanyId !== undefined && propertyCompanyId !== null) {
      if (user.companyId !== propertyCompanyId) {
        return false;
      }
    }

    const isPropertyScoped =
      targetPropertyId !== undefined ||
      PROPERTY_SCOPED_PERMISSIONS.has(permission);

    if (isPropertyScoped) {
      // For property-scoped permissions, OWNER requires established property context with resolved companyId
      if (user.role === 'OWNER') {
        if (!targetPropertyId || !propertyCompanyId) {
          // FAIL CLOSED: Missing targetPropertyId or missing propertyCompanyId
          return false;
        }
        return this.canAccessProperty(user, targetPropertyId, propertyCompanyId);
      }

      // If propertyCompanyId is provided, enforce canAccessProperty for other roles too
      if (targetPropertyId && propertyCompanyId) {
        if (!this.canAccessProperty(user, targetPropertyId, propertyCompanyId)) {
          return false;
        }
      }

      // Check Property-scoped permissions for assigned staff/managers
      if (targetPropertyId && user.propertyAccess) {
        const pa = user.propertyAccess.find((access) => access.propertyId === targetPropertyId);
        if (pa && pa.permissions && pa.permissions.includes(permission)) {
          return true;
        }
      }

      // Check explicit global permissions on User model
      if (user.permissions && user.permissions.includes(permission)) {
        return true;
      }

      return false;
    }

    // Company-global / Non-property-scoped permissions (e.g., company settings, property creation)
    if (user.role === 'OWNER') {
      return true;
    }

    // Check global permissions on User model
    if (user.permissions && user.permissions.includes(permission)) {
      return true;
    }

    return false;
  }

  /**
   * Evaluates permissions that are explicitly company-scoped (e.g., company-wide payroll reporting).
   * Fails closed if user.companyId is missing or does not match targetCompanyId.
   */
  hasCompanyPermission(
    user?: AuthUserContext,
    permission?: Permission,
    targetCompanyId?: string | null,
  ): boolean {
    if (!user || !permission) return false;
    if (user.role === 'SUPER_ADMIN') return true;
    if (!user.companyId || !targetCompanyId || user.companyId !== targetCompanyId) return false;
    if (user.role === 'OWNER') return true;
    return user.permissions?.includes(permission) || false;
  }

  /**
   * Asserts that the user possesses a required permission.
   */
  assertPermission(
    user?: AuthUserContext,
    permission?: Permission,
    targetPropertyId?: string,
    propertyCompanyId?: string | null,
  ): void {
    if (!this.hasPermission(user, permission, targetPropertyId, propertyCompanyId)) {
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
   *
   * Phase 3.2: Now covers ALL WorkShift financial snapshot fields.
   */
  maskFinancialFields<T extends Record<string, any>>(
    data: T,
    user?: AuthUserContext,
    targetPropertyId?: string,
    propertyCompanyId?: string | null,
  ): T {
    if (!data || typeof data !== 'object') return data;
    if (user?.role === 'SUPER_ADMIN') return data;

    // Resolve companyId defensively if not explicitly passed
    const resolvedCompanyId =
      propertyCompanyId ||
      data.location?.companyId ||
      data.property?.companyId ||
      data.companyId;

    const canViewPayRate = this.hasPermission(user, Permission.VIEW_PAY_RATE, targetPropertyId, resolvedCompanyId);
    const canViewBillRate = this.hasPermission(user, Permission.VIEW_BILL_RATE, targetPropertyId, resolvedCompanyId);
    const canViewMarkup = this.hasPermission(user, Permission.VIEW_MARKUP, targetPropertyId, resolvedCompanyId);

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
      delete result.markupTypeApplied;
      delete result.markupValueApplied;
    }

    if (!canViewBillRate && !canViewMarkup) {
      delete result.minimumShiftMinsApplied;
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

    if (actor.role === 'OWNER') {
      // OWNER can access all properties within their company
      if (actor.companyId && employeeCompanyId && actor.companyId === employeeCompanyId) {
        return employeePropertyIds;
      }
      return [];
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

    if (sharedPropIds.length === 0 && actor.role !== 'SUPER_ADMIN' && actor.role !== 'OWNER') {
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
    if (!actor || actor.role === 'SUPER_ADMIN' || actor.role === 'OWNER') {
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

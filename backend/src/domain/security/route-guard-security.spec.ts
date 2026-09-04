import * as assert from 'assert';
import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthorizationService, AuthUserContext } from './authorization.service';
import { Permission } from '../permissions/permission.enum';
import { TenantGuard } from '../../adapters/guards/tenant.guard';
import { PermissionsGuard } from '../../adapters/guards/permissions.guard';
import { StaffController } from '../../adapters/controllers/staff.controller';
import { LocationController } from '../../adapters/controllers/location.controller';

/**
 * Creates a mock NestJS ExecutionContext for testing Guards with real route metadata.
 */
function createMockExecutionContext(req: any, handlerFn: Function, targetClass: any = StaffController): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => ({}),
      getNext: () => ({}),
    }),
    getHandler: () => handlerFn,
    getClass: () => targetClass,
  } as unknown as ExecutionContext;
}

export async function runRouteGuardSecurityTests() {
  const reflector = new Reflector();
  const authzService = new AuthorizationService();
  const tenantGuard = new TenantGuard(reflector, authzService);
  const permissionsGuard = new PermissionsGuard(reflector, authzService);

  // Mock services for controllers
  const mockStaffService: any = {
    findAll: async (allowedLocs: any, user: any) => {
      const canViewPayRate = authzService.hasPermission(user, Permission.VIEW_PAY_RATE);
      const data: any = { id: 'emp-101', firstName: 'John', lastName: 'Doe' };
      if (canViewPayRate) data.hourlyRate = 22.50;
      data.billRate = 35.00; // Will be tested for masking
      return [authzService.maskFinancialFields(data, user)];
    },
    findOne: async (id: string, user: any) => {
      const targetPropId = 'prop-a-id';
      authzService.assertCompanyAccess(user, 'company-a-id');
      authzService.assertPropertyAccess(user, targetPropId, 'company-a-id');
      const canViewPayRate = authzService.hasPermission(user, Permission.VIEW_PAY_RATE, targetPropId);
      const data: any = { id, firstName: 'John', lastName: 'Doe' };
      if (canViewPayRate) data.hourlyRate = 22.50;
      data.billRate = 35.00;
      return authzService.maskFinancialFields(data, user, targetPropId);
    },
    getDecryptedPin: async (id: string, user: any) => {
      const targetPropId = id === 'emp-prop-b' ? 'prop-b-id' : 'prop-a-id';
      authzService.assertCompanyAccess(user, 'company-a-id');
      authzService.assertPropertyAccess(user, targetPropId, 'company-a-id');
      authzService.assertPermission(user, Permission.VIEW_EMPLOYEE_PIN, targetPropId);
      return { id, pinCode: '123456' };
    },
    create: async (dto: any, user: any) => {
      authzService.assertPrivilegeEscalationSafety(user, dto.role, dto.permissions);
      return { id: 'new-user', role: dto.role };
    },
  };

  const mockLocationService: any = {
    update: async (id: string, dto: any, user: any) => {
      const locCompanyId = id === 'prop-comp-b' ? 'company-b-id' : 'company-a-id';
      authzService.assertCompanyAccess(user, locCompanyId);
      authzService.assertPropertyAccess(user, id, locCompanyId);
      return { id, name: 'Updated Location' };
    },
  };

  const staffController = new StaffController(mockStaffService);
  const locationController = new LocationController(mockLocationService);

  // =========================================================================
  // SCENARIO A: Company A user attempts to access Company B resource
  // Expected: 403 Forbidden
  // =========================================================================
  {
    const reqCompanyMismatch = {
      user: { id: 'u-comp-a', companyId: 'company-a-id', role: 'MANAGER' },
      headers: { 'x-company-id': 'company-b-id' },
    };
    const ctxA = createMockExecutionContext(reqCompanyMismatch, staffController.findAll, StaffController);
    assert.throws(
      () => tenantGuard.canActivate(ctxA),
      (err: any) => err instanceof ForbiddenException && err.message.includes('another company tenant'),
      'Scenario A failed: TenantGuard did not throw 403 on cross-company attempt',
    );
  }

  // =========================================================================
  // SCENARIO B: Manager assigned to Property A attempts to request Property B
  // Expected: 403 Forbidden
  // =========================================================================
  {
    const managerPropA: AuthUserContext = {
      id: 'mgr-a',
      email: 'mgr-a@company-a.com',
      companyId: 'company-a-id',
      role: 'MANAGER',
      assignedLocationIds: ['prop-a-id'],
      propertyAccess: [{ propertyId: 'prop-a-id', permissions: [Permission.PROPERTY_MANAGE] }],
    };

    // Test controller update on unauthorized property
    await assert.rejects(
      async () => locationController.update('prop-b-id', { name: 'Hack' }, { user: managerPropA } as any),
      (err: any) => err instanceof ForbiddenException && err.message.includes('prop-b-id'),
      'Scenario B failed: LocationController allowed unauthorized property modification',
    );
  }

  // =========================================================================
  // SCENARIO C: Manager without VIEW_EMPLOYEE_PIN calls GET /api/v1/staff/:id/pin
  // Expected: 403 Forbidden
  // =========================================================================
  {
    const reqNoPinPermission = {
      user: {
        id: 'mgr-no-pin',
        email: 'mgr-no-pin@company-a.com',
        companyId: 'company-a-id',
        role: 'MANAGER',
        assignedLocationIds: ['prop-a-id'],
        permissions: [Permission.STAFF_VIEW],
      },
      headers: { 'x-property-id': 'prop-a-id' },
      params: { id: 'emp-101' },
    };
    const ctxC = createMockExecutionContext(reqNoPinPermission, staffController.getPin, StaffController);

    assert.throws(
      () => permissionsGuard.canActivate(ctxC),
      (err: any) => err instanceof ForbiddenException && err.message.includes('VIEW_EMPLOYEE_PIN'),
      'Scenario C failed: PermissionsGuard did not throw 403 for missing VIEW_EMPLOYEE_PIN',
    );
  }

  // =========================================================================
  // SCENARIO D: Authorized Manager with VIEW_EMPLOYEE_PIN but no access to Employee's Property
  // Expected: 403 Forbidden
  // =========================================================================
  {
    const managerPropAWithPin: AuthUserContext = {
      id: 'mgr-pin-propa',
      email: 'mgr-pin-propa@company-a.com',
      companyId: 'company-a-id',
      role: 'MANAGER',
      assignedLocationIds: ['prop-a-id'],
      permissions: [Permission.VIEW_EMPLOYEE_PIN],
      propertyAccess: [{ propertyId: 'prop-a-id', permissions: [Permission.VIEW_EMPLOYEE_PIN] }],
    };

    const reqD = {
      user: managerPropAWithPin,
      headers: { 'x-property-id': 'prop-a-id' },
      params: { id: 'emp-prop-b' },
    };
    const ctxD = createMockExecutionContext(reqD, staffController.getPin, StaffController);

    // Guard passes because user has VIEW_EMPLOYEE_PIN on prop-a-id
    const guardPassed = permissionsGuard.canActivate(ctxD);
    assert.strictEqual(guardPassed, true, 'Scenario D setup error: Guard should pass permission check');

    // Service assertions fail because employee belongs to prop-b-id where manager has no access
    await assert.rejects(
      async () => staffController.getPin('emp-prop-b', { user: managerPropAWithPin } as any),
      (err: any) => err instanceof ForbiddenException && err.message.includes('prop-b-id'),
      'Scenario D failed: Service did not enforce property scope isolation on PIN fetch',
    );
  }

  // =========================================================================
  // SCENARIO E: Manager with VIEW_PAY_RATE = true, VIEW_BILL_RATE = false
  // Expected: pay rate present, bill rate absent
  // =========================================================================
  {
    const managerPayOnly: AuthUserContext = {
      id: 'mgr-pay-only',
      email: 'mgr-pay-only@company-a.com',
      companyId: 'company-a-id',
      role: 'MANAGER',
      assignedLocationIds: ['prop-a-id'],
      permissions: [Permission.VIEW_PAY_RATE],
      propertyAccess: [{ propertyId: 'prop-a-id', permissions: [Permission.VIEW_PAY_RATE] }],
    };

    const result: any = await staffController.findOne('emp-101', { user: managerPayOnly } as any);

    assert.strictEqual(result.firstName, 'John', 'Scenario E failed: name missing');
    assert.strictEqual(result.hourlyRate, 22.50, 'Scenario E failed: pay rate should be permitted');
    assert.strictEqual(result.billRate, undefined, 'Scenario E failed: bill rate MUST be absent');
    assert.strictEqual(result.otBillRate, undefined, 'Scenario E failed: ot bill rate MUST be absent');
    assert.strictEqual(result.markupValue, undefined, 'Scenario E failed: markup MUST be absent');
  }

  // =========================================================================
  // SCENARIO F: Non-SUPER_ADMIN attempts to create/promote user as SUPER_ADMIN
  // Expected: 403 Forbidden
  // =========================================================================
  {
    const ownerUser: AuthUserContext = {
      id: 'owner-comp-a',
      email: 'owner@company-a.com',
      companyId: 'company-a-id',
      role: 'OWNER',
    };

    await assert.rejects(
      async () => staffController.create({ role: 'SUPER_ADMIN', firstName: 'Escalator' }, { user: ownerUser } as any),
      (err: any) => err instanceof ForbiddenException && err.message.includes('Privilege escalation error'),
      'Scenario F failed: Non-SUPER_ADMIN allowed to assign SUPER_ADMIN role',
    );
  }

  console.log('✅ ALL 6 ROUTE / GUARD SECURITY INTEGRATION SCENARIOS (A-F) PASSED SUCCESSFULLY!');
}

if (require.main === module) {
  runRouteGuardSecurityTests();
}

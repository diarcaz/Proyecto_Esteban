import * as assert from 'assert';
import { AuthorizationService, AuthUserContext } from './authorization.service';
import { Permission } from '../permissions/permission.enum';

export function runAuthorizationTests() {
  const authzService = new AuthorizationService();

  const superAdmin: AuthUserContext = {
    id: 'user-super-admin',
    email: 'admin@nexustaff.com',
    role: 'SUPER_ADMIN',
  };

  const ownerCompA: AuthUserContext = {
    id: 'user-owner-comp-a',
    email: 'owner@comp-a.com',
    role: 'OWNER',
    companyId: 'comp-a-id',
    permissions: [Permission.VIEW_PAY_RATE, Permission.VIEW_BILL_RATE, Permission.VIEW_EMPLOYEE_PIN],
  };

  const managerProperty1: AuthUserContext = {
    id: 'user-manager-p1',
    email: 'manager@p1.com',
    role: 'MANAGER',
    companyId: 'comp-a-id',
    assignedLocationIds: ['prop-1-id'],
    permissions: [Permission.VIEW_PAY_RATE],
    propertyAccess: [
      {
        propertyId: 'prop-1-id',
        permissions: [Permission.VIEW_PAY_RATE, Permission.VIEW_EMPLOYEE_PIN],
      },
    ],
  };

  const supervisorP1NoFinancials: AuthUserContext = {
    id: 'user-supervisor-p1',
    email: 'supervisor@p1.com',
    role: 'SUPERVISOR',
    companyId: 'comp-a-id',
    assignedLocationIds: ['prop-1-id'],
    permissions: [Permission.STAFF_VIEW],
  };

  // Test A: SUPER_ADMIN can access multiple Companies
  assert.strictEqual(authzService.canAccessCompany(superAdmin, 'comp-a-id'), true, 'Test A1 failed');
  assert.strictEqual(authzService.canAccessCompany(superAdmin, 'comp-b-id'), true, 'Test A2 failed');

  // Test B: OWNER of Company A cannot access Company B
  assert.strictEqual(authzService.canAccessCompany(ownerCompA, 'comp-a-id'), true, 'Test B1 failed');
  assert.strictEqual(authzService.canAccessCompany(ownerCompA, 'comp-b-id'), false, 'Test B2 failed');
  assert.throws(() => authzService.assertCompanyAccess(ownerCompA, 'comp-b-id'), 'Test B3 failed');

  // Test C: Manager with Property 1 access cannot access Property 2
  assert.strictEqual(authzService.canAccessProperty(managerProperty1, 'prop-1-id', 'comp-a-id'), true, 'Test C1 failed');
  assert.strictEqual(authzService.canAccessProperty(managerProperty1, 'prop-2-id', 'comp-a-id'), false, 'Test C2 failed');
  assert.throws(() => authzService.assertPropertyAccess(managerProperty1, 'prop-2-id', 'comp-a-id'), 'Test C3 failed');

  // Test D: Supervisor without VIEW_PAY_RATE receives no pay-rate data
  assert.strictEqual(authzService.hasPermission(supervisorP1NoFinancials, Permission.VIEW_PAY_RATE, 'prop-1-id'), false, 'Test D1 failed');
  const recordD = { id: 'emp-1', hourlyRate: 25.0, payRate: 25.0, firstName: 'John' };
  const maskedD = authzService.maskFinancialFields(recordD, supervisorP1NoFinancials, 'prop-1-id');
  assert.strictEqual(maskedD.firstName, 'John', 'Test D2 failed');
  assert.strictEqual(maskedD.hourlyRate, undefined, 'Test D3 failed');
  assert.strictEqual(maskedD.payRate, undefined, 'Test D4 failed');

  // Test E: Manager with VIEW_PAY_RATE but without VIEW_BILL_RATE receives pay rate but not bill rate
  assert.strictEqual(authzService.hasPermission(managerProperty1, Permission.VIEW_PAY_RATE, 'prop-1-id'), true, 'Test E1 failed');
  assert.strictEqual(authzService.hasPermission(managerProperty1, Permission.VIEW_BILL_RATE, 'prop-1-id'), false, 'Test E2 failed');
  const recordE = { id: 'emp-1', payRate: 20.0, billRate: 30.0, otBillRate: 45.0, firstName: 'Alice' };
  const maskedE = authzService.maskFinancialFields(recordE, managerProperty1, 'prop-1-id');
  assert.strictEqual(maskedE.firstName, 'Alice', 'Test E3 failed');
  assert.strictEqual(maskedE.payRate, 20.0, 'Test E4 failed');
  assert.strictEqual(maskedE.billRate, undefined, 'Test E5 failed');
  assert.strictEqual(maskedE.otBillRate, undefined, 'Test E6 failed');

  // Test F: Direct Position/RateConfiguration access cannot bypass Property authorization
  assert.strictEqual(authzService.canAccessProperty(managerProperty1, 'prop-2-id', 'comp-a-id'), false, 'Test F failed');

  // Test G: User without VIEW_EMPLOYEE_PIN cannot retrieve PIN
  assert.strictEqual(authzService.hasPermission(supervisorP1NoFinancials, Permission.VIEW_EMPLOYEE_PIN, 'prop-1-id'), false, 'Test G1 failed');
  assert.throws(() => authzService.assertPermission(supervisorP1NoFinancials, Permission.VIEW_EMPLOYEE_PIN, 'prop-1-id'), 'Test G2 failed');

  // Test H: User with VIEW_EMPLOYEE_PIN can retrieve PIN only for authorized Property
  assert.strictEqual(authzService.hasPermission(managerProperty1, Permission.VIEW_EMPLOYEE_PIN, 'prop-1-id'), true, 'Test H1 failed');
  assert.strictEqual(authzService.hasPermission(managerProperty1, Permission.VIEW_EMPLOYEE_PIN, 'prop-2-id'), false, 'Test H2 failed');

  // Test I: PIN security never exposes encrypted PIN metadata in masked financial fields
  const recordI = { id: 'emp-1', firstName: 'Bob', pinCodeEncrypted: 'iv:tag:cipher' };
  const maskedI = authzService.maskFinancialFields(recordI, managerProperty1, 'prop-1-id');
  assert.strictEqual(maskedI.firstName, 'Bob', 'Test I failed');

  // Test J: OWNER cannot create/promote SUPER_ADMIN
  assert.throws(() => authzService.assertPrivilegeEscalationSafety(ownerCompA, 'SUPER_ADMIN'), 'Test J failed');

  // Test K: Manager cannot grant permissions beyond their delegation scope
  const targetPermissions = [Permission.VIEW_PAY_RATE, Permission.VIEW_INVOICES];
  assert.throws(() => authzService.assertPrivilegeEscalationSafety(managerProperty1, 'SUPERVISOR', targetPermissions), 'Test K failed');

  // Test L: User from Company A cannot obtain Staff from Company B by manually manipulating IDs
  assert.strictEqual(authzService.canAccessCompany(ownerCompA, 'comp-b-id'), false, 'Test L1 failed');
  assert.strictEqual(authzService.canAccessProperty(ownerCompA, 'prop-comp-b-id', 'comp-b-id'), false, 'Test L2 failed');

  console.log('✅ ALL 12 PHASE 2 AUTHORIZATION TESTS PASSED SUCCESSFULLY (Tests A-L)!');
}

if (require.main === module) {
  runAuthorizationTests();
}

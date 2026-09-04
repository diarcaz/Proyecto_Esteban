import * as assert from 'assert';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuthorizationService, AuthUserContext } from './authorization.service';
import { StaffService } from '../../application/services/staff.service';
import { Permission } from '../permissions/permission.enum';
import { encryptPin } from '../../infrastructure/security/pin-encryption.util';

export async function runStaffServiceSecurityTests() {
  const authzService = new AuthorizationService();

  // Test Entities
  const companyAlpha = { id: 'comp-alpha', name: 'Alpha Staffing Corp', taxId: 'TAX-001' };
  const propertyA = { id: 'prop-a', companyId: 'comp-alpha', name: 'Property A', locationCode: 'LOC-A' };
  const propertyB = { id: 'prop-b', companyId: 'comp-alpha', name: 'Property B', locationCode: 'LOC-B' };

  // Actor Contexts
  const managerPropA: AuthUserContext = {
    id: 'mgr-a-id',
    email: 'managerA@alpha.com',
    role: 'MANAGER',
    companyId: 'comp-alpha',
    assignedLocationIds: ['prop-a'],
    permissions: [Permission.VIEW_PAY_RATE, Permission.STAFF_VIEW],
    propertyAccess: [{ propertyId: 'prop-a', permissions: [Permission.VIEW_PAY_RATE, Permission.STAFF_VIEW] }],
  };

  const managerPropBWithPin: AuthUserContext = {
    id: 'mgr-b-id',
    email: 'managerB@alpha.com',
    role: 'MANAGER',
    companyId: 'comp-alpha',
    assignedLocationIds: ['prop-b'],
    permissions: [Permission.VIEW_PAY_RATE, Permission.VIEW_EMPLOYEE_PIN, Permission.STAFF_VIEW],
    propertyAccess: [{ propertyId: 'prop-b', permissions: [Permission.VIEW_PAY_RATE, Permission.VIEW_EMPLOYEE_PIN, Permission.STAFF_VIEW] }],
  };

  // Mock Database State
  const now = new Date();
  const pastDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const futureDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const mockUsers: any[] = [
    {
      id: 'emp-john',
      companyId: 'comp-alpha',
      employeeNumber: 'EMP-JOHN',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@alpha.com',
      role: 'WORKER',
      status: 'ACTIVE',
      hourlyRate: 25.0,
      pinCodeHash: 'hash-123456',
      pinCodeEncrypted: encryptPin('123456'),
      assignments: [
        { locationId: 'prop-a', location: propertyA },
      ],
      employeeAssignments: [
        {
          id: 'ea-john-b',
          propertyId: 'prop-b',
          property: propertyB,
          active: true,
          effectiveFrom: pastDate,
          effectiveUntil: futureDate,
        },
      ],
    },
    {
      id: 'emp-stale',
      companyId: 'comp-alpha',
      employeeNumber: 'EMP-STALE',
      firstName: 'Stale',
      lastName: 'User',
      email: 'stale@alpha.com',
      role: 'WORKER',
      status: 'ACTIVE',
      hourlyRate: 20.0,
      assignments: [],
      employeeAssignments: [
        {
          id: 'ea-stale-b',
          propertyId: 'prop-b',
          property: propertyB,
          active: false, // INACTIVE assignment
          effectiveFrom: pastDate,
          effectiveUntil: pastDate,
        },
      ],
    },
    {
      id: 'emp-prop-b-only',
      companyId: 'comp-alpha',
      employeeNumber: 'EMP-PROPB-ONLY',
      firstName: 'Bob',
      lastName: 'OnlyB',
      email: 'bob@alpha.com',
      role: 'WORKER',
      status: 'ACTIVE',
      hourlyRate: 30.0,
      assignments: [
        { locationId: 'prop-b', location: propertyB },
      ],
      employeeAssignments: [],
    },
  ];

  const mockAuditLogs: any[] = [];

  // In-Memory Prisma Mock
  const mockPrisma: any = {
    user: {
      findMany: async (args: any) => {
        const where = args?.where || {};
        return mockUsers.filter((u) => {
          if (where.companyId && u.companyId !== where.companyId) return false;
          if (where.status && u.status !== where.status) return false;

          // Process OR match for assignments & employeeAssignments
          if (where.OR && Array.isArray(where.OR)) {
            const matchesOr = where.OR.some((clause: any) => {
              if (clause.assignments?.some?.locationId?.in) {
                const targetIds = clause.assignments.some.locationId.in;
                const userLocIds = (u.assignments || []).map((a: any) => a.locationId);
                if (userLocIds.some((id: string) => targetIds.includes(id))) return true;
              }
              if (clause.employeeAssignments?.some?.propertyId?.in) {
                const targetIds = clause.employeeAssignments.some.propertyId.in;
                const userEmpPropIds = (u.employeeAssignments || [])
                  .filter((ea: any) => ea.active && new Date(ea.effectiveFrom) <= now && (!ea.effectiveUntil || new Date(ea.effectiveUntil) >= now))
                  .map((ea: any) => ea.propertyId);
                if (userEmpPropIds.some((id: string) => targetIds.includes(id))) return true;
              }
              return false;
            });
            if (!matchesOr) return false;
          }

          return true;
        });
      },
      findUnique: async (args: any) => {
        const id = args.where.id;
        return mockUsers.find((u) => u.id === id) || null;
      },
      update: async (args: any) => {
        const id = args.where.id;
        const u = mockUsers.find((user) => user.id === id);
        if (u && args.data) {
          Object.assign(u, args.data);
        }
        return u;
      },
    },
    auditLog: {
      create: async (args: any) => {
        mockAuditLogs.push(args.data);
        return args.data;
      },
    },
  };

  const staffService = new StaffService(mockPrisma, authzService);

  // =========================================================================
  // TEST 1: Manager Property A requests allowed_location_ids = Property B
  // Expected: Property B staff NOT returned (returns empty array)
  // =========================================================================
  {
    const result1 = await staffService.findAll(['prop-b'], managerPropA);
    assert.strictEqual(result1.length, 0, 'TEST 1 FAILED: Manager Prop A allowed_location_ids=prop-b returned unauthorized staff!');
  }

  // =========================================================================
  // TEST 2: Employee belongs to Property A + B. Manager only has Property B.
  // Expected: Manager B CAN access employee John through Property B
  // =========================================================================
  {
    const result2 = await staffService.findOne('emp-john', managerPropBWithPin);
    assert.strictEqual(result2.id, 'emp-john', 'TEST 2 FAILED: Manager Prop B failed to access employee John');
    assert.strictEqual(result2.firstName, 'John', 'TEST 2 FAILED: Employee John details missing');
  }

  // =========================================================================
  // TEST 3: Employee belongs to Property A + B. Manager only has Property A.
  // Expected: Staff response MUST NOT expose Property B assignment metadata
  // =========================================================================
  {
    const result3: any = await staffService.findOne('emp-john', managerPropA);
    assert.strictEqual(result3.id, 'emp-john', 'TEST 3 Setup: Manager A accesses John via Prop A');

    // Confirm response DTO contains ONLY prop-a assignment metadata
    const exposedAssignments = result3.assignments || [];
    const exposedEmployeeAssignments = result3.employeeAssignments || [];

    const hasPropBAssignment = exposedAssignments.some((a: any) => a.locationId === 'prop-b' || a.location?.id === 'prop-b');
    const hasPropBEmpAssignment = exposedEmployeeAssignments.some((ea: any) => ea.propertyId === 'prop-b' || ea.property?.id === 'prop-b');

    assert.strictEqual(hasPropBAssignment, false, 'TEST 3 FAILED: Response exposed unauthorized Property B legacy assignment metadata to Manager A!');
    assert.strictEqual(hasPropBEmpAssignment, false, 'TEST 3 FAILED: Response exposed unauthorized Property B employeeAssignment metadata to Manager A!');
  }

  // =========================================================================
  // TEST 4: Employee belongs to Property A + B. Manager has VIEW_EMPLOYEE_PIN only at Property B.
  // Expected: PIN retrieval allowed and audit Property ID = Property B
  // =========================================================================
  {
    const pinResult = await staffService.getDecryptedPin('emp-john', managerPropBWithPin);
    assert.strictEqual(pinResult.pinCode, '123456', 'TEST 4 FAILED: Manager Prop B with VIEW_EMPLOYEE_PIN could not retrieve PIN');

    const lastAudit = mockAuditLogs[mockAuditLogs.length - 1];
    assert.strictEqual(lastAudit.action, 'VIEW_EMPLOYEE_PIN', 'TEST 4 FAILED: Audit action mismatch');
    assert.strictEqual(lastAudit.details.authorizingPropertyId, 'prop-b', 'TEST 4 FAILED: Audit property ID was not Property B!');
  }

  // =========================================================================
  // TEST 5: Employee has active EmployeeAssignment at Property B but no legacy UserLocationAssignment for B.
  // Expected: Security logic still recognizes Property B membership
  // =========================================================================
  {
    const empJohnPropIds = authzService.getEmployeePropertyIds(mockUsers[0]);
    assert.strictEqual(empJohnPropIds.includes('prop-b'), true, 'TEST 5 FAILED: getEmployeePropertyIds failed to recognize active EmployeeAssignment at Property B');
  }

  // =========================================================================
  // TEST 6: EmployeeAssignment is inactive or effectiveUntil is in the past.
  // Expected: It does NOT grant active Property membership
  // =========================================================================
  {
    const stalePropIds = authzService.getEmployeePropertyIds(mockUsers[1]);
    assert.strictEqual(stalePropIds.length, 0, 'TEST 6 FAILED: Inactive/expired EmployeeAssignment was incorrectly recognized as active');

    await assert.rejects(
      async () => staffService.findOne('emp-stale', managerPropBWithPin),
      (err: any) => err instanceof ForbiddenException && err.message.includes('EMP-STALE'),
      'TEST 6 FAILED: Manager B was allowed to access employee with stale/inactive property assignment',
    );
  }

  console.log('✅ ALL 6 REAL STAFF SERVICE SECURITY TESTS (TEST 1 - TEST 6) PASSED SUCCESSFULLY!');
}

if (require.main === module) {
  runStaffServiceSecurityTests();
}

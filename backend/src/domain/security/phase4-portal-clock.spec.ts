import * as assert from 'assert';
import * as bcrypt from 'bcrypt';
import { AttendanceService } from '../../application/services/attendance.service';
import { WorkShiftService } from '../../application/services/work-shift.service';
import { AuthorizationService } from './authorization.service';
import { AttendanceType, AttendanceMethod } from '../entities/attendance-log.entity';

export async function runPhase4PortalClockTests() {
  console.log('\n================================================================');
  console.log(' RUNNING PHASE 4 PORTAL SEPARATION & CLOCK TEST SUITE (1-15)    ');
  console.log('================================================================\n');

  const testPin = '123456';
  const hashedPin = await bcrypt.hash(testPin, 10);
  const wrongPin = '999999';

  // Mock Locations
  const locA = {
    id: 'loc-uuid-aaa',
    name: 'Sucursal Centro Merida',
    locationCode: 'MID-1001',
    timezone: 'America/Merida',
    operationalConfig: { maxShiftDurationMinutes: 480 },
  };

  const locB = {
    id: 'loc-uuid-bbb',
    name: 'Sucursal Norte Merida',
    locationCode: 'MID-1002',
    timezone: 'America/Merida',
    operationalConfig: { maxShiftDurationMinutes: 480 },
  };

  // Ambiguous duplicate location code
  const locDupe1 = {
    id: 'loc-uuid-dupe-1',
    name: 'Duplicate Property 1',
    locationCode: 'DUP-999',
    timezone: 'America/Merida',
  };
  const locDupe2 = {
    id: 'loc-uuid-dupe-2',
    name: 'Duplicate Property 2',
    locationCode: 'DUP-999',
    timezone: 'America/Merida',
  };

  const allLocations = [locA, locB, locDupe1, locDupe2];

  // Mock Users
  const activeWorker = {
    id: 'worker-user-1',
    employeeNumber: 'EMP-1001',
    firstName: 'Carlos',
    lastName: 'Gomez',
    role: 'WORKER',
    status: 'ACTIVE',
    pinCodeHash: hashedPin,
  };

  const inactiveWorker = {
    id: 'worker-user-2',
    employeeNumber: 'EMP-1002',
    firstName: 'Maria',
    lastName: 'Lopez',
    role: 'WORKER',
    status: 'INACTIVE',
    pinCodeHash: hashedPin,
  };

  // Mock Redis
  const redisStore: Record<string, { count: number; ttl: number }> = {};
  const mockRedisService: any = {
    getFailedAttempts: async (key: string) => redisStore[key]?.count || 0,
    incrementFailedAttempts: async (key: string, ttl: number) => {
      if (!redisStore[key]) redisStore[key] = { count: 0, ttl };
      redisStore[key].count += 1;
      return redisStore[key].count;
    },
    resetFailedAttempts: async (key: string) => {
      delete redisStore[key];
    },
  };

  // Mock DB State
  let workShiftsDb: any[] = [];
  let attendanceLogsDb: any[] = [];
  let auditLogsDb: any[] = [];
  let employeeAssignmentsDb: any[] = [];

  const mockPrisma: any = {
    location: {
      findUnique: async ({ where }: any) => allLocations.find((l) => l.id === where.id) || null,
      findMany: async ({ where }: any) => allLocations.filter((l) => l.locationCode === where?.locationCode),
    },
    user: {
      findUnique: async ({ where }: any) => {
        if (where.employeeNumber === activeWorker.employeeNumber) return activeWorker;
        if (where.employeeNumber === inactiveWorker.employeeNumber) return inactiveWorker;
        return null;
      },
    },
    employeeAssignment: {
      findMany: async ({ where }: any) => {
        return employeeAssignmentsDb.filter((a) => a.userId === where.userId && a.propertyId === where.propertyId && a.active);
      },
      findFirst: async ({ where }: any) => {
        return employeeAssignmentsDb.find((a) => a.userId === where.userId && a.propertyId === where.propertyId && a.active) || null;
      },
    },
    userLocationAssignment: {
      findFirst: async () => null,
    },
    workShift: {
      findFirst: async ({ where, orderBy }: any) => {
        const matching = workShiftsDb.filter((s) => s.userId === where.userId && (!where.status || s.status === where.status));
        return matching[matching.length - 1] || null;
      },
      findUnique: async ({ where }: any) => workShiftsDb.find((s) => s.id === where.id) || null,
      update: async ({ where, data }: any) => {
        const idx = workShiftsDb.findIndex((s) => s.id === where.id);
        if (idx !== -1) {
          workShiftsDb[idx] = { ...workShiftsDb[idx], ...data };
          return workShiftsDb[idx];
        }
        return null;
      },
    },
    auditLog: {
      create: async ({ data }: any) => {
        auditLogsDb.push(data);
        return data;
      },
    },
  };

  const authzService = new AuthorizationService();
  const workShiftService = new WorkShiftService(mockPrisma, authzService);
  const attendanceService = new AttendanceService(mockPrisma, mockRedisService, workShiftService);

  // -------------------------------------------------------------
  // TEST 1: Constraint 1.1 — Resolve location with only property_id
  // -------------------------------------------------------------
  const res1 = await attendanceService.resolveKioskProperty('loc-uuid-aaa', undefined);
  assert.strictEqual(res1.id, 'loc-uuid-aaa');
  assert.strictEqual(res1.locationCode, 'MID-1001');
  console.log('✓ TEST 1: Kiosk property resolution with only property_id -> succeeded');

  // -------------------------------------------------------------
  // TEST 2: Constraint 1.2 — Resolve location with invalid property_id -> 404
  // -------------------------------------------------------------
  let test2Passed = false;
  try {
    await attendanceService.resolveKioskProperty('loc-invalid-uuid', undefined);
  } catch (err: any) {
    if (err?.message?.includes('not found') || err?.status === 404) test2Passed = true;
  }
  assert.strictEqual(test2Passed, true, 'TEST 2 failed: expected NotFoundException');
  console.log('✓ TEST 2: Kiosk property resolution with invalid property_id -> rejected (NotFound)');

  // -------------------------------------------------------------
  // TEST 3: Constraint 1.3 — Resolve location with unique location_code
  // -------------------------------------------------------------
  const res3 = await attendanceService.resolveKioskProperty(undefined, 'MID-1002');
  assert.strictEqual(res3.id, 'loc-uuid-bbb');
  console.log('✓ TEST 3: Kiosk property resolution with unique location_code -> succeeded');

  // -------------------------------------------------------------
  // TEST 4: Constraint 1.5 — Resolve location with ambiguous location_code (2+) -> rejected
  // -------------------------------------------------------------
  let test4Passed = false;
  try {
    await attendanceService.resolveKioskProperty(undefined, 'DUP-999');
  } catch (err: any) {
    if (err?.message?.includes('ambiguity') || err?.message?.includes('Multiple locations')) test4Passed = true;
  }
  assert.strictEqual(test4Passed, true, 'TEST 4 failed: expected ambiguity BadRequestException');
  console.log('✓ TEST 4: Ambiguous location_code (2+ matches) -> rejected with ambiguity error');

  // -------------------------------------------------------------
  // TEST 5: Constraint 1.6 — Provide BOTH property_id and location_code (matching same) -> succeeded
  // -------------------------------------------------------------
  const res5 = await attendanceService.resolveKioskProperty('loc-uuid-aaa', 'MID-1001');
  assert.strictEqual(res5.id, 'loc-uuid-aaa');
  console.log('✓ TEST 5: Matching property_id and location_code -> confirmed identical and accepted');

  // -------------------------------------------------------------
  // TEST 6: Constraint 1.7 — Provide BOTH property_id and location_code (contradictory) -> rejected
  // -------------------------------------------------------------
  let test6Passed = false;
  try {
    // loc-uuid-aaa is MID-1001, but passing MID-1002
    await attendanceService.resolveKioskProperty('loc-uuid-aaa', 'MID-1002');
  } catch (err: any) {
    if (err?.message?.includes('Contradictory location context')) test6Passed = true;
  }
  assert.strictEqual(test6Passed, true, 'TEST 6 failed: contradictory location context was not rejected');
  console.log('✓ TEST 6: Contradictory property_id and location_code -> strictly rejected (not ignored)');

  // -------------------------------------------------------------
  // TEST 7: Constraint 1.8 — Provide neither property_id nor location_code -> rejected
  // -------------------------------------------------------------
  let test7Passed = false;
  try {
    await attendanceService.resolveKioskProperty(undefined, undefined);
  } catch (err: any) {
    test7Passed = true;
  }
  assert.strictEqual(test7Passed, true, 'TEST 7 failed: missing property context not rejected');
  console.log('✓ TEST 7: Missing both property_id and location_code -> rejected');

  // -------------------------------------------------------------
  // TEST 8: Kiosk Authentication & Redis Lockout
  // -------------------------------------------------------------
  const lockKey = `kiosk_pin:${activeWorker.employeeNumber}`;
  // 4 wrong PIN attempts
  for (let i = 0; i < 4; i++) {
    try {
      await attendanceService.resolveKioskIdentityAndContext(activeWorker.employeeNumber, wrongPin, 'loc-uuid-aaa');
    } catch (e) {}
  }
  assert.strictEqual(await mockRedisService.getFailedAttempts(lockKey), 4);

  // 5th wrong attempt triggers lockout
  let test8Locked = false;
  try {
    await attendanceService.resolveKioskIdentityAndContext(activeWorker.employeeNumber, wrongPin, 'loc-uuid-aaa');
  } catch (e: any) {
    if (e?.message?.includes('locked')) test8Locked = true;
  }
  assert.strictEqual(test8Locked, true, 'TEST 8 failed: account not locked after 5 failed PINs');

  // Reset lockout for further testing
  await mockRedisService.resetFailedAttempts(lockKey);
  console.log('✓ TEST 8: Redis lockout on 5 consecutive failed PIN attempts -> verified');

  // -------------------------------------------------------------
  // TEST 9: Constraint 3.1 — EmployeeAssignment ambiguity on multiple conflicting assignments
  // -------------------------------------------------------------
  employeeAssignmentsDb = [
    {
      id: 'asg-1',
      userId: activeWorker.id,
      propertyId: 'loc-uuid-aaa',
      departmentId: 'dept-1',
      positionId: 'pos-1',
      rateConfigurationId: 'rate-1',
      active: true,
      effectiveFrom: new Date(Date.now() - 86400000),
      effectiveUntil: null,
    },
    {
      id: 'asg-2',
      userId: activeWorker.id,
      propertyId: 'loc-uuid-aaa',
      departmentId: 'dept-2',
      positionId: 'pos-2',
      rateConfigurationId: 'rate-2',
      active: true,
      effectiveFrom: new Date(Date.now() - 86400000),
      effectiveUntil: null,
    },
  ];

  let test9Ambiguous = false;
  try {
    await attendanceService.resolveKioskIdentityAndContext(activeWorker.employeeNumber, testPin, 'loc-uuid-aaa');
  } catch (e: any) {
    if (e?.message?.includes('Configuration ambiguity') && e?.message?.includes('active EmployeeAssignments')) {
      test9Ambiguous = true;
    }
  }
  assert.strictEqual(test9Ambiguous, true, 'TEST 9 failed: conflicting assignments did not trigger ambiguity error');
  console.log('✓ TEST 9: Multiple conflicting EmployeeAssignments -> rejected with configuration ambiguity');

  // -------------------------------------------------------------
  // TEST 10: Single active EmployeeAssignment -> succeeds
  // -------------------------------------------------------------
  employeeAssignmentsDb = [
    {
      id: 'asg-1',
      userId: activeWorker.id,
      propertyId: 'loc-uuid-aaa',
      departmentId: 'dept-1',
      positionId: 'pos-1',
      rateConfigurationId: 'rate-1',
      department: { id: 'dept-1', name: 'Front Desk', deptCode: 'FD' },
      position: { id: 'pos-1', title: 'Receptionist', code: 'REC' },
      active: true,
      effectiveFrom: new Date(Date.now() - 86400000),
      effectiveUntil: null,
    },
  ];

  const ctx10 = await attendanceService.resolveKioskIdentityAndContext(activeWorker.employeeNumber, testPin, 'loc-uuid-aaa');
  assert.strictEqual(ctx10.user.id, activeWorker.id);
  assert.strictEqual(ctx10.location.id, 'loc-uuid-aaa');
  assert.strictEqual(ctx10.assignment.id, 'asg-1');
  console.log('✓ TEST 10: Single active EmployeeAssignment -> resolved context successfully');

  // -------------------------------------------------------------
  // TEST 11: Constraint 4.1 & 4.2 — Shift State Read MUST NOT Silently Mutate Data
  // -------------------------------------------------------------
  const now = new Date();
  const nineHoursAgo = new Date(now.getTime() - 9 * 60 * 60 * 1000); // 540 mins ago (exceeds 480 mins max)

  workShiftsDb = [
    {
      id: 'shift-overdue-1',
      userId: activeWorker.id,
      locationId: 'loc-uuid-aaa',
      status: 'OPEN',
      clockInTimestamp: nineHoursAgo,
      hourlyRate: 25.5,
      grossPay: 200,
      location: locA,
      logs: [
        {
          id: 'log-1',
          workShiftId: 'shift-overdue-1',
          punchType: AttendanceType.CLOCK_IN,
          timestamp: nineHoursAgo,
        },
      ],
    },
  ];

  const shiftState11 = await workShiftService.getEmployeeShiftState(activeWorker.id, 'loc-uuid-aaa', now);
  // Evaluates as overdue
  assert.strictEqual(shiftState11.currentStatus, 'MISSED_CLOCK_OUT');
  assert.strictEqual(shiftState11.activeShift?.isOverdue, true);

  // Constraint 4: DB must NOT be modified
  const shiftInDb = workShiftsDb.find((s) => s.id === 'shift-overdue-1');
  assert.strictEqual(shiftInDb.status, 'OPEN', 'TEST 11 failed: read endpoint mutated workShift in DB!');
  assert.strictEqual(auditLogsDb.length, 0, 'TEST 11 failed: read endpoint created audit log mutation!');
  console.log('✓ TEST 11: Overdue shift read flags MISSED_CLOCK_OUT without mutating DB or logs (Constraint 4)');

  // -------------------------------------------------------------
  // TEST 12: Zero Financial Fields in Kiosk Status Response
  // -------------------------------------------------------------
  const statusDto = {
    employee_number: activeWorker.employeeNumber,
    pin_code: testPin,
    property_id: 'loc-uuid-aaa',
  };
  const statusRes = await attendanceService.getKioskEmployeeStatus(statusDto);

  assert.strictEqual((statusRes as any).hourlyRate, undefined);
  assert.strictEqual((statusRes as any).grossPay, undefined);
  assert.strictEqual((statusRes as any).rateConfigurationId, undefined);
  assert.strictEqual((statusRes.shiftState as any).hourlyRate, undefined);
  assert.strictEqual(statusRes.employee.displayName, 'Carlos Gomez');
  assert.strictEqual(statusRes.location.locationCode, 'MID-1001');
  console.log('✓ TEST 12: Kiosk status response exposes ZERO financial fields');

  // -------------------------------------------------------------
  // TEST 13: Punch Sequence Allowed Actions Progression
  // -------------------------------------------------------------
  // Normal non-overdue open shift with only CLOCK_IN: allowed actions are LUNCH_START, CLOCK_OUT
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  workShiftsDb = [
    {
      id: 'shift-normal-1',
      userId: activeWorker.id,
      locationId: 'loc-uuid-aaa',
      status: 'OPEN',
      clockInTimestamp: oneHourAgo,
      location: locA,
      logs: [
        {
          id: 'log-1',
          workShiftId: 'shift-normal-1',
          punchType: AttendanceType.CLOCK_IN,
          timestamp: oneHourAgo,
        },
      ],
    },
  ];

  const state13 = await workShiftService.getEmployeeShiftState(activeWorker.id, 'loc-uuid-aaa', now);
  assert.strictEqual(state13.currentStatus, 'CLOCKED_IN');
  assert.deepStrictEqual(state13.allowedActions, [AttendanceType.LUNCH_START, AttendanceType.CLOCK_OUT]);
  console.log('✓ TEST 13: Clocked-in shift evaluated allowedActions -> [LUNCH_START, CLOCK_OUT]');

  // Shift on meal break: allowed action is LUNCH_END
  workShiftsDb[0].logs.push({
    id: 'log-2',
    workShiftId: 'shift-normal-1',
    punchType: AttendanceType.LUNCH_START,
    timestamp: new Date(now.getTime() - 30 * 60 * 1000),
  });
  const stateMeal = await workShiftService.getEmployeeShiftState(activeWorker.id, 'loc-uuid-aaa', now);
  assert.strictEqual(stateMeal.currentStatus, 'MEAL_BREAK');
  assert.deepStrictEqual(stateMeal.allowedActions, [AttendanceType.LUNCH_END]);
  console.log('✓ TEST 14: Meal break shift evaluated allowedActions -> [LUNCH_END]');

  // No active shift: allowed action is CLOCK_IN
  workShiftsDb = [];
  const stateOff = await workShiftService.getEmployeeShiftState(activeWorker.id, 'loc-uuid-aaa', now);
  assert.strictEqual(stateOff.currentStatus, 'CLOCKED_OUT');
  assert.deepStrictEqual(stateOff.allowedActions, [AttendanceType.CLOCK_IN]);
  console.log('✓ TEST 15: Clocked-out shift evaluated allowedActions -> [CLOCK_IN]');

  console.log('\n================================================================');
  console.log(' ✅ ALL 15 PHASE 4 PORTAL SEPARATION & CLOCK TESTS PASSED!      ');
  console.log('================================================================\n');
}

if (require.main === module) {
  runPhase4PortalClockTests().catch((err) => {
    console.error('❌ PHASE 4 TEST FAILURE:', err);
    process.exit(1);
  });
}

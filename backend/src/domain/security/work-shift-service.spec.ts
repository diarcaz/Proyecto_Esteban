import * as assert from 'assert';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { WorkShiftService } from '../../application/services/work-shift.service';
import { TimeCorrectionService } from '../../application/services/time-correction.service';
import { AuthorizationService, AuthUserContext } from './authorization.service';
import { AttendanceType, AttendanceStatus, AttendanceMethod } from '../entities/attendance-log.entity';
import { Permission } from '../permissions/permission.enum';

export async function runWorkShiftServiceTests() {
  const authzService = new AuthorizationService();

  // Test Setup Data
  const compAlpha = 'comp-alpha';
  const propA = 'prop-a';
  const propB = 'prop-b';

  const userWorker: AuthUserContext = {
    id: 'worker-1',
    email: 'worker1@alpha.com',
    role: 'WORKER',
    companyId: compAlpha,
    assignedLocationIds: [propA],
  };

  const supervisorPropA: AuthUserContext = {
    id: 'super-a',
    email: 'supera@alpha.com',
    role: 'SUPERVISOR',
    companyId: compAlpha,
    assignedLocationIds: [propA],
    permissions: [Permission.TIME_APPROVE, Permission.VIEW_PAY_RATE],
    propertyAccess: [{ propertyId: propA, permissions: [Permission.TIME_APPROVE, Permission.VIEW_PAY_RATE] }],
  };

  const supervisorPropB: AuthUserContext = {
    id: 'super-b',
    email: 'superb@alpha.com',
    role: 'SUPERVISOR',
    companyId: compAlpha,
    assignedLocationIds: [propB],
    permissions: [Permission.TIME_APPROVE],
    propertyAccess: [{ propertyId: propB, permissions: [Permission.TIME_APPROVE] }],
  };

  // Mock State
  const now = new Date();
  const pastDate = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 30);

  const dbUsers: any[] = [
    { id: 'worker-1', companyId: compAlpha, employeeNumber: 'EMP-001', firstName: 'John', lastName: 'Worker', role: 'WORKER', status: 'ACTIVE' },
    { id: 'worker-unassigned', companyId: compAlpha, employeeNumber: 'EMP-002', firstName: 'Jane', lastName: 'NoProp', role: 'WORKER', status: 'ACTIVE' },
  ];

  const dbEmployeeAssignments: any[] = [
    { id: 'ea-1', userId: 'worker-1', propertyId: propA, positionId: 'pos-housekeeper', departmentId: 'dept-housekeeping', active: true, effectiveFrom: pastDate, effectiveUntil: null },
    { id: 'ea-expired', userId: 'worker-1', propertyId: propB, positionId: 'pos-housekeeper', departmentId: 'dept-housekeeping', active: true, effectiveFrom: pastDate, effectiveUntil: new Date(now.getTime() - 1000 * 60 * 60 * 24) },
  ];

  const dbRateConfigs: any[] = [
    { id: 'rate-hk-1', positionId: 'pos-housekeeper', payRate: 18.50, billRate: 25.00, otPayRate: 27.75, otBillRate: 37.50, effectiveFrom: pastDate, effectiveUntil: null },
  ];

  const dbOperationalConfigs: any[] = [
    { locationId: propA, maxShiftDurationMinutes: 960 }, // 16 hours
    { locationId: propB, maxShiftDurationMinutes: 480 }, // 8 hours
  ];

  const dbUserLocAssignments: any[] = [
    { userId: 'worker-1', locationId: propA },
  ];

  const dbWorkShifts: any[] = [];
  const dbAttendanceLogs: any[] = [];
  const dbTimeCorrectionRequests: any[] = [];
  const dbAuditLogs: any[] = [];

  let idCounter = 1;

  // Mock Prisma Service
  const mockPrisma: any = {
    user: {
      findUnique: async (args: any) => dbUsers.find((u) => u.id === args.where.id) || null,
    },
    userLocationAssignment: {
      findFirst: async (args: any) => dbUserLocAssignments.find((ula) => ula.userId === args.where.userId && ula.locationId === args.where.locationId) || null,
    },
    employeeAssignment: {
      findFirst: async (args: any) => {
        const { userId, propertyId, active, effectiveFrom } = args.where;
        return dbEmployeeAssignments.find((ea) => {
          if (ea.userId !== userId || ea.propertyId !== propertyId) return false;
          if (active !== undefined && ea.active !== active) return false;
          if (effectiveFrom?.lte && new Date(ea.effectiveFrom) > effectiveFrom.lte) return false;
          if (ea.effectiveUntil && new Date(ea.effectiveUntil) < effectiveFrom.lte) return false;
          return true;
        }) || null;
      },
    },
    propertyOperationalConfig: {
      findUnique: async (args: any) => dbOperationalConfigs.find((c) => c.locationId === args.where.locationId) || null,
    },
    rateConfiguration: {
      findFirst: async (args: any) => {
        const { positionId, effectiveFrom } = args.where;
        return dbRateConfigs.find((rc) => {
          if (rc.positionId !== positionId) return false;
          if (effectiveFrom?.lte && new Date(rc.effectiveFrom) > effectiveFrom.lte) return false;
          if (rc.effectiveUntil && new Date(rc.effectiveUntil) < effectiveFrom.lte) return false;
          return true;
        }) || null;
      },
    },
    workShift: {
      create: async (args: any) => {
        const shift = { id: `ws-${idCounter++}`, ...args.data, createdAt: new Date(), updatedAt: new Date() };
        dbWorkShifts.push(shift);
        return shift;
      },
      findFirst: async (args: any) => {
        const { userId, status, id } = args.where || {};
        if (id) return dbWorkShifts.find((s) => s.id === id) || null;
        const matches = dbWorkShifts.filter((s) => {
          if (userId && s.userId !== userId) return false;
          if (status && s.status !== status) return false;
          return true;
        });
        return matches.length > 0 ? matches[matches.length - 1] : null;
      },
      findMany: async (args: any) => dbWorkShifts,
      findUnique: async (args: any) => {
        const s = dbWorkShifts.find((shift) => shift.id === args.where.id);
        if (!s) return null;
        return {
          ...s,
          location: { id: s.locationId, companyId: compAlpha },
        };
      },
      update: async (args: any) => {
        const shift = dbWorkShifts.find((s) => s.id === args.where.id);
        if (shift && args.data) Object.assign(shift, args.data);
        return shift;
      },
    },
    attendanceLog: {
      create: async (args: any) => {
        const log = { id: `log-${idCounter++}`, ...args.data, createdAt: new Date() };
        dbAttendanceLogs.push(log);
        return log;
      },
      findFirst: async (args: any) => {
        const { userId, punchType, workShiftId } = args.where || {};
        const matches = dbAttendanceLogs.filter((l) => {
          if (userId && l.userId !== userId) return false;
          if (punchType && l.punchType !== punchType) return false;
          if (workShiftId && l.workShiftId !== workShiftId) return false;
          return true;
        });
        return matches.length > 0 ? matches[matches.length - 1] : null;
      },
      findMany: async (args: any) => {
        const { workShiftId } = args.where || {};
        if (workShiftId) return dbAttendanceLogs.filter((l) => l.workShiftId === workShiftId);
        return dbAttendanceLogs;
      },
      findUnique: async (args: any) => dbAttendanceLogs.find((l) => l.id === args.where.id) || null,
    },
    timeCorrectionRequest: {
      create: async (args: any) => {
        const req = { id: `tcr-${idCounter++}`, ...args.data, createdAt: new Date(), updatedAt: new Date() };
        dbTimeCorrectionRequests.push(req);
        return req;
      },
      findUnique: async (args: any) => {
        const req = dbTimeCorrectionRequests.find((r) => r.id === args.where.id);
        if (!req) return null;
        return {
          ...req,
          property: { id: req.propertyId, companyId: compAlpha },
          workShift: dbWorkShifts.find((ws) => ws.id === req.workShiftId) || null,
        };
      },
      findMany: async (args: any) => dbTimeCorrectionRequests,
      update: async (args: any) => {
        const req = dbTimeCorrectionRequests.find((r) => r.id === args.where.id);
        if (req && args.data) Object.assign(req, args.data);
        return req;
      },
    },
    auditLog: {
      create: async (args: any) => {
        dbAuditLogs.push(args.data);
        return args.data;
      },
    },
    $transaction: async (fn: any) => await fn(mockPrisma),
  };

  const workShiftService = new WorkShiftService(mockPrisma, authzService);
  const timeCorrectionService = new TimeCorrectionService(mockPrisma, authzService);

  // =========================================================================
  // TEST 1: CLOCK_IN creates AttendanceLog + WorkShift
  // =========================================================================
  const clockInTime = new Date('2026-09-04T10:00:00Z');
  const res1: any = await workShiftService.processPunchSequence('worker-1', propA, AttendanceType.CLOCK_IN, AttendanceMethod.KIOSK_PIN, clockInTime);
  assert.strictEqual(!!res1.shift, true, 'TEST 1 FAILED: WorkShift was not created');
  assert.strictEqual(res1.shift.status, 'OPEN', 'TEST 1 FAILED: WorkShift status should be OPEN');
  assert.strictEqual(!!res1.log, true, 'TEST 1 FAILED: AttendanceLog was not created');
  assert.strictEqual(res1.log.workShiftId, res1.shift.id, 'TEST 1 FAILED: AttendanceLog not linked to WorkShift');

  // =========================================================================
  // TEST 2: Second CLOCK_IN while WorkShift is open: rejected
  // =========================================================================
  const clockInTime2 = new Date('2026-09-04T10:05:00Z');
  await assert.rejects(
    async () => workShiftService.processPunchSequence('worker-1', propA, AttendanceType.CLOCK_IN, AttendanceMethod.KIOSK_PIN, clockInTime2),
    (err: any) => err instanceof BadRequestException && err.message.includes('already has an open work shift'),
    'TEST 2 FAILED: Second CLOCK_IN while open was not rejected',
  );

  // =========================================================================
  // TEST 3: Overnight shift: CLOCK_IN 22:00 Sep 4, CLOCK_OUT 06:00 Sep 5 results in ONE WorkShift
  // =========================================================================
  // Reset active shift for worker-1
  dbWorkShifts.length = 0;
  dbAttendanceLogs.length = 0;

  const nightIn = new Date('2026-09-04T22:00:00Z');
  const nightOut = new Date('2026-09-05T06:00:00Z');

  const nightInRes: any = await workShiftService.processPunchSequence('worker-1', propA, AttendanceType.CLOCK_IN, AttendanceMethod.KIOSK_PIN, nightIn);
  const nightShiftId = nightInRes.shift.id;

  const nightOutRes: any = await workShiftService.processPunchSequence('worker-1', propA, AttendanceType.CLOCK_OUT, AttendanceMethod.KIOSK_PIN, nightOut);

  assert.strictEqual(nightOutRes.shift.id, nightShiftId, 'TEST 3 FAILED: Overnight shift created multiple WorkShifts instead of ONE');
  assert.strictEqual(nightOutRes.shift.status, 'COMPLETED', 'TEST 3 FAILED: Overnight shift status should be COMPLETED');

  // =========================================================================
  // TEST 4: WorkShift uses Property timezone correctly for display
  // =========================================================================
  const propTimezoneFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', dateStyle: 'short', timeStyle: 'short' });
  const formattedIn = propTimezoneFormatter.format(nightInRes.shift.clockInTimestamp);
  assert.strictEqual(typeof formattedIn, 'string', 'TEST 4 FAILED: Property timezone formatting failed');

  // =========================================================================
  // TEST 5: CLOCK_OUT without open shift: rejected
  // =========================================================================
  dbWorkShifts.length = 0;
  dbAttendanceLogs.length = 0;
  await assert.rejects(
    async () => workShiftService.processPunchSequence('worker-1', propA, AttendanceType.CLOCK_OUT, AttendanceMethod.KIOSK_PIN, new Date()),
    (err: any) => err instanceof BadRequestException && err.message.includes('without an open work shift'),
    'TEST 5 FAILED: CLOCK_OUT without open shift was not rejected',
  );

  // =========================================================================
  // TEST 6: LUNCH_END without LUNCH_START: rejected
  // =========================================================================
  await workShiftService.processPunchSequence('worker-1', propA, AttendanceType.CLOCK_IN, AttendanceMethod.KIOSK_PIN, new Date());
  await assert.rejects(
    async () => workShiftService.processPunchSequence('worker-1', propA, AttendanceType.LUNCH_END, AttendanceMethod.KIOSK_PIN, new Date()),
    (err: any) => err instanceof BadRequestException && err.message.includes('Must perform LUNCH_START'),
    'TEST 6 FAILED: LUNCH_END without LUNCH_START was not rejected',
  );

  // =========================================================================
  // TEST 7: Double LUNCH_START: rejected
  // =========================================================================
  await workShiftService.processPunchSequence('worker-1', propA, AttendanceType.LUNCH_START, AttendanceMethod.KIOSK_PIN, new Date());
  await assert.rejects(
    async () => workShiftService.processPunchSequence('worker-1', propA, AttendanceType.LUNCH_START, AttendanceMethod.KIOSK_PIN, new Date()),
    (err: any) => err instanceof BadRequestException && err.message.includes('Already on lunch break'),
    'TEST 7 FAILED: Double LUNCH_START was not rejected',
  );

  // =========================================================================
  // TEST 8: RateConfiguration effective at clock-in is snapshotted
  // =========================================================================
  dbWorkShifts.length = 0;
  dbAttendanceLogs.length = 0;
  const rateInRes: any = await workShiftService.processPunchSequence('worker-1', propA, AttendanceType.CLOCK_IN, AttendanceMethod.KIOSK_PIN, new Date());
  assert.strictEqual(rateInRes.shift.payRateApplied, 18.50, 'TEST 8 FAILED: payRateApplied was not snapshotted');
  assert.strictEqual(rateInRes.shift.billRateApplied, 25.00, 'TEST 8 FAILED: billRateApplied was not snapshotted');

  // =========================================================================
  // TEST 9: Changing RateConfiguration later does NOT modify historical WorkShift snapshot
  // =========================================================================
  dbRateConfigs[0].payRate = 99.99; // Mutate rate config in database
  const fetchedShift = await workShiftService.getShiftById(rateInRes.shift.id, supervisorPropA);
  assert.strictEqual(fetchedShift.payRateApplied, 18.50, 'TEST 9 FAILED: Historical shift rate snapshot was retroactively modified!');
  dbRateConfigs[0].payRate = 18.50; // Restore rate

  // =========================================================================
  // TEST 10: No RateConfiguration: no invented rate
  // =========================================================================
  dbWorkShifts.length = 0;
  dbAttendanceLogs.length = 0;
  // Temporary remove rate config
  const originalRates = [...dbRateConfigs];
  dbRateConfigs.length = 0;
  const noRateRes: any = await workShiftService.processPunchSequence('worker-1', propA, AttendanceType.CLOCK_IN, AttendanceMethod.KIOSK_PIN, new Date());
  assert.strictEqual(noRateRes.shift.payRateApplied, null, 'TEST 10 FAILED: Invented rate created when RateConfiguration missing');
  dbRateConfigs.push(...originalRates);

  // =========================================================================
  // TEST 11: Employee with no active assignment to selected Property: clock denied
  // =========================================================================
  await assert.rejects(
    async () => workShiftService.processPunchSequence('worker-unassigned', propA, AttendanceType.CLOCK_IN, AttendanceMethod.KIOSK_PIN, new Date()),
    (err: any) => err instanceof ForbiddenException && err.message.includes('has no active assignment'),
    'TEST 11 FAILED: Unassigned property clock-in was not denied',
  );

  // =========================================================================
  // TEST 12: Expired EmployeeAssignment: clock denied
  // =========================================================================
  await assert.rejects(
    async () => workShiftService.processPunchSequence('worker-1', propB, AttendanceType.CLOCK_IN, AttendanceMethod.KIOSK_PIN, new Date()),
    (err: any) => err instanceof ForbiddenException && err.message.includes('has no active assignment'),
    'TEST 12 FAILED: Expired EmployeeAssignment clock-in was not denied',
  );

  // =========================================================================
  // TEST 13: Shift exceeds maxShiftDuration: flagged for correction, no fabricated CLOCK_OUT
  // =========================================================================
  dbWorkShifts.length = 0;
  dbAttendanceLogs.length = 0;
  const oldClockIn = new Date('2026-09-01T08:00:00Z');
  const nowPunch = new Date('2026-09-02T10:00:00Z'); // 26 hours later (> 16 hours)

  await workShiftService.processPunchSequence('worker-1', propA, AttendanceType.CLOCK_IN, AttendanceMethod.KIOSK_PIN, oldClockIn);
  const flagged = await workShiftService.checkMissedClockOuts(propA);
  assert.strictEqual(flagged.length, 1, 'TEST 13 FAILED: Missed clock-out shift was not flagged');

  const missedShift = dbWorkShifts.find((s) => s.id === flagged[0]);
  assert.strictEqual(missedShift.status, 'MISSED_CLOCK_OUT', 'TEST 13 FAILED: WorkShift status should be MISSED_CLOCK_OUT');
  assert.strictEqual(!missedShift.clockOutTimestamp, true, 'TEST 13 FAILED: Fabricated clock-out timestamp created on missed clock-out!');

  // =========================================================================
  // TEST 14: Missed CLOCK_OUT correction request: PENDING with original missing value preserved
  // =========================================================================
  const reqDto = {
    work_shift_id: missedShift.id,
    location_id: propA,
    requested_timestamp: '2026-09-01T17:00:00Z',
    correction_type: 'MISSED_CLOCK_OUT' as const,
    reason: 'Forgot to clock out',
  };

  const correctionReq = await timeCorrectionService.createCorrectionRequest(reqDto, { id: 'worker-1', companyId: compAlpha, assignedLocationIds: [propA] });
  assert.strictEqual(correctionReq.status, 'PENDING', 'TEST 14 FAILED: Time correction request status should be PENDING');
  assert.strictEqual(correctionReq.originalTimestamp, null, 'TEST 14 FAILED: Original missing timestamp was not preserved as null');

  // =========================================================================
  // TEST 15: TIME_APPROVE authorized Supervisor can approve correction for own Property
  // =========================================================================
  const approvedReq = await timeCorrectionService.approveCorrectionRequest(correctionReq.id, { comments: 'Approved by supervisor' }, supervisorPropA);
  assert.strictEqual(approvedReq.status, 'APPROVED', 'TEST 15 FAILED: Supervisor failed to approve time correction request');

  // =========================================================================
  // TEST 16: Supervisor Property A cannot approve Property B correction
  // =========================================================================
  const reqPropBDto = {
    location_id: propB,
    requested_timestamp: '2026-09-01T17:00:00Z',
    correction_type: 'MISSED_CLOCK_OUT' as const,
    reason: 'Forgot clock out at B',
  };
  const tcrPropB = await timeCorrectionService.createCorrectionRequest(reqPropBDto, { id: 'worker-1', companyId: compAlpha, assignedLocationIds: [propB] });

  await assert.rejects(
    async () => timeCorrectionService.approveCorrectionRequest(tcrPropB.id, { comments: 'Hack' }, supervisorPropA),
    (err: any) => err instanceof ForbiddenException && err.message.includes('Access denied for property scope'),
    'TEST 16 FAILED: Supervisor Prop A was allowed to approve Property B correction!',
  );

  // =========================================================================
  // TEST 17: Approved correction changes effective WorkShift clock-out but does not create/overwrite fake raw punch
  // =========================================================================
  const shiftAfterApproval = await mockPrisma.workShift.findUnique({ where: { id: missedShift.id } });
  assert.strictEqual(shiftAfterApproval.effectiveClockOut.toISOString(), '2026-09-01T17:00:00.000Z', 'TEST 17 FAILED: Effective clock-out was not updated on WorkShift');
  assert.strictEqual(shiftAfterApproval.status, 'COMPLETED', 'TEST 17 FAILED: WorkShift status should be COMPLETED after approval');

  // Verify raw punches remain untouched (no fake raw AttendanceLog was inserted)
  const rawPunches = await mockPrisma.attendanceLog.findMany({ where: { workShiftId: missedShift.id } });
  const rawClockOutLogs = rawPunches.filter((p: any) => p.punchType === AttendanceType.CLOCK_OUT);
  assert.strictEqual(rawClockOutLogs.length, 0, 'TEST 17 FAILED: Fake raw AttendanceLog punch was created upon correction approval!');

  // =========================================================================
  // TEST 18: Rejected correction: does not alter effective shift
  // =========================================================================
  const tcrReject = await timeCorrectionService.createCorrectionRequest({
    location_id: propB,
    requested_timestamp: '2026-09-01T18:00:00Z',
    correction_type: 'INCORRECT_CLOCK_OUT' as const,
    reason: 'Wrong time',
  }, { id: 'worker-1', companyId: compAlpha, assignedLocationIds: [propB] });

  const rejectedReq = await timeCorrectionService.rejectCorrectionRequest(tcrReject.id, { comments: 'Invalid time' }, supervisorPropB);
  assert.strictEqual(rejectedReq.status, 'REJECTED', 'TEST 18 FAILED: Correction request status should be REJECTED');

  // =========================================================================
  // TEST 19: Correction cannot be approved twice
  // =========================================================================
  await assert.rejects(
    async () => timeCorrectionService.approveCorrectionRequest(approvedReq.id, { comments: 'Double' }, supervisorPropA),
    (err: any) => err instanceof BadRequestException && err.message.includes('has already been reviewed'),
    'TEST 19 FAILED: Time correction request was allowed to be approved twice',
  );

  // =========================================================================
  // TEST 20: Concurrent/double punch protection
  // =========================================================================
  dbWorkShifts.length = 0;
  dbAttendanceLogs.length = 0;
  const punchTime1 = new Date();
  const punchTime2 = new Date(punchTime1.getTime() + 1000); // 1 second later

  await workShiftService.processPunchSequence('worker-1', propA, AttendanceType.CLOCK_IN, AttendanceMethod.KIOSK_PIN, punchTime1);
  await assert.rejects(
    async () => workShiftService.processPunchSequence('worker-1', propA, AttendanceType.CLOCK_IN, AttendanceMethod.KIOSK_PIN, punchTime2),
    (err: any) => err instanceof BadRequestException,
    'TEST 20 FAILED: Double punch while open was not rejected',
  );
  assert.strictEqual(dbWorkShifts.length, 1, 'TEST 20 FAILED: Double punch created 2 open WorkShifts instead of 1!');

  // =========================================================================
  // TEST 21: Raw rounded punch remains unchanged while effective rounded value is separate
  // =========================================================================
  const rawLog = dbAttendanceLogs[0];
  assert.strictEqual(rawLog.timestamp.getTime(), punchTime1.getTime(), 'TEST 21 FAILED: Raw AttendanceLog timestamp was modified!');

  // =========================================================================
  // TEST 22: WorkShift financial snapshot is not exposed to unauthorized caller
  // =========================================================================
  const supervisorNoFinancials: AuthUserContext = {
    id: 'super-no-fin',
    email: 'supernofin@alpha.com',
    role: 'SUPERVISOR',
    companyId: compAlpha,
    assignedLocationIds: [propA],
    permissions: [Permission.STAFF_VIEW],
  };

  const maskedShift = await workShiftService.getShiftById(dbWorkShifts[0].id, supervisorNoFinancials);
  assert.strictEqual(maskedShift.payRateApplied, undefined, 'TEST 22 FAILED: payRateApplied was exposed to unauthorized caller!');
  assert.strictEqual(maskedShift.billRateApplied, undefined, 'TEST 22 FAILED: billRateApplied was exposed to unauthorized caller!');

  console.log('✅ ALL 22 REAL PHASE 3 WORK SHIFT SECURITY TESTS (TEST 1 - TEST 22) PASSED SUCCESSFULLY!');
}

if (require.main === module) {
  runWorkShiftServiceTests();
}

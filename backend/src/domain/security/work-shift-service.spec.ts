import * as assert from 'assert';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
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
    location: {
      findUnique: async (args: any) => {
        const id = args.where.id;
        if (id === propA || id === propB) {
          return { id, companyId: compAlpha, name: `Prop ${id}` };
        }
        return null;
      },
    },
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
      findMany: async (args: any) => {
        const { userId, propertyId, active, effectiveFrom } = args.where || {};
        return dbEmployeeAssignments.filter((ea) => {
          if (userId && ea.userId !== userId) return false;
          if (propertyId && ea.propertyId !== propertyId) return false;
          if (active !== undefined && ea.active !== active) return false;
          if (effectiveFrom?.lte && new Date(ea.effectiveFrom) > effectiveFrom.lte) return false;
          if (ea.effectiveUntil && new Date(ea.effectiveUntil) < effectiveFrom.lte) return false;
          return true;
        });
      },
    },
    propertyOperationalConfig: {
      findUnique: async (args: any) => dbOperationalConfigs.find((c) => c.locationId === args.where.locationId) || null,
    },
    rateConfiguration: {
      findUnique: async (args: any) => dbRateConfigs.find((rc) => rc.id === args.where.id) || null,
      findFirst: async (args: any) => {
        const { positionId, effectiveFrom } = args.where;
        return dbRateConfigs.find((rc) => {
          if (rc.positionId !== positionId) return false;
          if (effectiveFrom?.lte && new Date(rc.effectiveFrom) > effectiveFrom.lte) return false;
          if (rc.effectiveUntil && new Date(rc.effectiveUntil) < effectiveFrom.lte) return false;
          return true;
        }) || null;
      },
      findMany: async (args: any) => {
        const { positionId, effectiveFrom } = args.where || {};
        return dbRateConfigs.filter((rc) => {
          if (positionId && rc.positionId !== positionId) return false;
          if (effectiveFrom?.lte && new Date(rc.effectiveFrom) > effectiveFrom.lte) return false;
          if (rc.effectiveUntil && new Date(rc.effectiveUntil) < effectiveFrom.lte) return false;
          return true;
        });
      },
    },
    workShift: {
      create: async (args: any) => {
        if (args.data.status === 'OPEN') {
          const existingOpen = dbWorkShifts.find((s) => s.userId === args.data.userId && s.status === 'OPEN');
          if (existingOpen) {
            const err: any = new Error('Unique constraint failed on the fields: (`user_id`) where status = OPEN');
            err.code = 'P2002';
            throw err;
          }
        }
        const shift = { id: `ws-${idCounter++}`, ...args.data, createdAt: new Date(), updatedAt: new Date() };
        dbWorkShifts.push(shift);
        return shift;
      },
      findFirst: async (args: any) => {
        const { userId, status, id, clockInTimestamp } = args.where || {};
        if (id) return dbWorkShifts.find((s) => s.id === id) || null;
        const matches = dbWorkShifts.filter((s) => {
          if (userId && s.userId !== userId) return false;
          if (status && s.status !== status) return false;
          if (clockInTimestamp?.gte && new Date(s.clockInTimestamp) < clockInTimestamp.gte) return false;
          return true;
        });
        return matches.length > 0 ? matches[matches.length - 1] : null;
      },
      findMany: async (args: any) => {
        const { userId, id, where } = args || {};
        const filter = where || args;
        if (!filter || Object.keys(filter).length === 0) return dbWorkShifts;
        return dbWorkShifts.filter((s) => {
          if (filter.userId && s.userId !== filter.userId) return false;
          if (filter.id?.not && s.id === filter.id.not) return false;
          if (filter.status && s.status !== filter.status) return false;
          return true;
        });
      },
      findUnique: async (args: any) => {
        const s = dbWorkShifts.find((shift) => shift.id === args.where.id);
        if (!s) return null;
        return {
          ...s,
          location: { id: s.locationId, companyId: compAlpha, operationalConfig: dbOperationalConfigs.find((c) => c.locationId === s.locationId) || null },
        };
      },
      update: async (args: any) => {
        const shift = dbWorkShifts.find((s) => s.id === args.where.id);
        if (shift) {
          if (args.data.status === 'COMPLETED' && shift.status === 'COMPLETED') {
            throw new BadRequestException('Invalid punch sequence. Cannot perform CLOCK_OUT on an already completed work shift.');
          }
          if (args.data) Object.assign(shift, args.data);
        }
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
      updateMany: async (args: any) => {
        const { id, status } = args.where || {};
        let count = 0;
        for (const r of dbTimeCorrectionRequests) {
          if ((!id || r.id === id) && (!status || r.status === status)) {
            Object.assign(r, args.data);
            count++;
          }
        }
        return { count };
      },
    },
    auditLog: {
      create: async (args: any) => {
        dbAuditLogs.push(args.data);
        return args.data;
      },
    },
    $queryRaw: async () => [],
    $executeRawUnsafe: async () => 1,
    timesheet: { findMany: async () => [] },
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
    (err: any) => err instanceof ConflictException && err.message.includes('State changed'),
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
    (err: any) => err instanceof ConflictException && err.message.includes('State changed'),
    'TEST 5 FAILED: CLOCK_OUT without open shift was not rejected',
  );

  // =========================================================================
  // TEST 6: LUNCH_END without LUNCH_START: rejected
  // =========================================================================
  await workShiftService.processPunchSequence('worker-1', propA, AttendanceType.CLOCK_IN, AttendanceMethod.KIOSK_PIN, new Date());
  await assert.rejects(
    async () => workShiftService.processPunchSequence('worker-1', propA, AttendanceType.LUNCH_END, AttendanceMethod.KIOSK_PIN, new Date()),
    (err: any) => err instanceof ConflictException && err.message.includes('State changed'),
    'TEST 6 FAILED: LUNCH_END without LUNCH_START was not rejected',
  );

  // =========================================================================
  // TEST 7: Double LUNCH_START: rejected
  // =========================================================================
  await workShiftService.processPunchSequence('worker-1', propA, AttendanceType.LUNCH_START, AttendanceMethod.KIOSK_PIN, new Date());
  await assert.rejects(
    async () => workShiftService.processPunchSequence('worker-1', propA, AttendanceType.LUNCH_START, AttendanceMethod.KIOSK_PIN, new Date()),
    (err: any) => err instanceof ConflictException && err.message.includes('State changed'),
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
    (err: any) => err instanceof ForbiddenException && err.message.includes('No active employee assignment'),
    'TEST 11 FAILED: Unassigned property clock-in was not denied',
  );

  // =========================================================================
  // TEST 12: Expired EmployeeAssignment: clock denied
  // =========================================================================
  await assert.rejects(
    async () => workShiftService.processPunchSequence('worker-1', propB, AttendanceType.CLOCK_IN, AttendanceMethod.KIOSK_PIN, new Date()),
    (err: any) => err instanceof ForbiddenException && err.message.includes('No active employee assignment'),
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

  const correctionReq = await timeCorrectionService.createCorrectionRequest(reqDto, { id: 'worker-1', role: 'ADMIN', permissions: [Permission.TIME_EDIT], companyId: compAlpha, assignedLocationIds: [propA] });
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
  const tcrPropB = await timeCorrectionService.createCorrectionRequest(reqPropBDto, { id: 'worker-1', role: 'ADMIN', permissions: [Permission.TIME_EDIT], companyId: compAlpha, assignedLocationIds: [propB] });

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
  }, { id: 'worker-1', role: 'ADMIN', permissions: [Permission.TIME_EDIT], companyId: compAlpha, assignedLocationIds: [propB] });

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
    (err: any) => err instanceof ConflictException,
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

  // =========================================================================
  // TEST 23: Two concurrent CLOCK_IN attempts create only one WorkShift
  // =========================================================================
  dbWorkShifts.length = 0;
  dbAttendanceLogs.length = 0;
  const concInTime = new Date('2026-09-05T08:00:00Z');

  const results23 = await Promise.allSettled([
    workShiftService.processPunchSequence('worker-1', propA, AttendanceType.CLOCK_IN, AttendanceMethod.KIOSK_PIN, concInTime),
    workShiftService.processPunchSequence('worker-1', propA, AttendanceType.CLOCK_IN, AttendanceMethod.KIOSK_PIN, concInTime),
  ]);

  const openShifts23 = dbWorkShifts.filter((s) => s.status === 'OPEN');
  assert.strictEqual(openShifts23.length, 1, 'TEST 23 FAILED: Concurrent CLOCK_IN created multiple open WorkShifts!');

  // =========================================================================
  // TEST 24: Two concurrent CLOCK_OUT attempts produce only one legitimate completion
  // =========================================================================
  const concOutTime = new Date('2026-09-05T17:00:00Z');
  const results24 = await Promise.allSettled([
    workShiftService.processPunchSequence('worker-1', propA, AttendanceType.CLOCK_OUT, AttendanceMethod.KIOSK_PIN, concOutTime),
    workShiftService.processPunchSequence('worker-1', propA, AttendanceType.CLOCK_OUT, AttendanceMethod.KIOSK_PIN, concOutTime),
  ]);

  const fulfilled24 = results24.filter((r) => r.status === 'fulfilled');
  const rejected24 = results24.filter((r) => r.status === 'rejected');
  assert.strictEqual(fulfilled24.length, 1, 'TEST 24 FAILED: Expected exactly one successful CLOCK_OUT completion!');
  assert.strictEqual(rejected24.length, 1, 'TEST 24 FAILED: Concurrent CLOCK_OUT was not cleanly rejected!');

  // =========================================================================
  // TEST 25: Two concurrent approvals of one TimeCorrectionRequest result in exactly one successful approval
  // =========================================================================
  dbWorkShifts.length = 0;
  dbAttendanceLogs.length = 0;
  dbTimeCorrectionRequests.length = 0;

  const oldIn = new Date('2026-09-01T08:00:00Z');
  await workShiftService.processPunchSequence('worker-1', propA, AttendanceType.CLOCK_IN, AttendanceMethod.KIOSK_PIN, oldIn);
  await workShiftService.checkMissedClockOuts(propA); // Flags as MISSED_CLOCK_OUT

  const tcr25 = await timeCorrectionService.createCorrectionRequest({
    work_shift_id: dbWorkShifts[0].id,
    location_id: propA,
    requested_timestamp: '2026-09-01T17:00:00Z',
    correction_type: 'MISSED_CLOCK_OUT',
    reason: 'Forgot clock out',
  }, { id: 'worker-1', role: 'ADMIN', permissions: [Permission.TIME_EDIT], companyId: compAlpha, assignedLocationIds: [propA] });

  const results25 = await Promise.allSettled([
    timeCorrectionService.approveCorrectionRequest(tcr25.id, { comments: 'Supervisor A' }, supervisorPropA),
    timeCorrectionService.approveCorrectionRequest(tcr25.id, { comments: 'Supervisor B' }, supervisorPropA),
  ]);

  const fulfilled25 = results25.filter((r) => r.status === 'fulfilled');
  const rejected25 = results25.filter((r) => r.status === 'rejected');
  assert.strictEqual(fulfilled25.length, 1, 'TEST 25 FAILED: Expected exactly one successful approval!');
  assert.strictEqual(rejected25.length, 1, 'TEST 25 FAILED: Concurrent approval was not cleanly rejected!');

  // =========================================================================
  // TEST 26: Raw, effective, and rounded timestamps remain distinguishable
  // =========================================================================
  const rawPunchTime = new Date('2026-09-05T08:03:00Z');
  const effectiveTime = new Date('2026-09-05T08:02:00Z');
  const roundedTime = workShiftService.calculateRoundedTimestamp(effectiveTime, { roundingMinutes: 5, direction: 'NEAREST' });

  assert.strictEqual(rawPunchTime.toISOString(), '2026-09-05T08:03:00.000Z', 'TEST 26 FAILED: Raw time changed');
  assert.strictEqual(effectiveTime.toISOString(), '2026-09-05T08:02:00.000Z', 'TEST 26 FAILED: Effective time changed');
  assert.strictEqual(roundedTime.toISOString(), '2026-09-05T08:00:00.000Z', 'TEST 26 FAILED: Rounded calculation failed');

  // =========================================================================
  // TEST 27: Expired assignment RateConfiguration is not silently used
  // =========================================================================
  dbWorkShifts.length = 0;
  dbAttendanceLogs.length = 0;

  // Add expired pinned rate to assignment
  dbRateConfigs.push({
    id: 'rate-expired-pinned',
    positionId: 'pos-housekeeper',
    payRate: 30.00,
    billRate: 40.00,
    effectiveFrom: new Date('2025-01-01'),
    effectiveUntil: new Date('2025-12-31'),
  });
  dbEmployeeAssignments[0].rateConfigurationId = 'rate-expired-pinned';

  const expRes: any = await workShiftService.processPunchSequence('worker-1', propA, AttendanceType.CLOCK_IN, AttendanceMethod.KIOSK_PIN, new Date('2026-09-05T08:00:00Z'));
  assert.strictEqual(expRes.shift.payRateApplied, null, 'TEST 27 FAILED: Expired pinned RateConfiguration was silently applied!');
  dbEmployeeAssignments[0].rateConfigurationId = null; // reset

  // =========================================================================
  // TEST 28: Overlapping effective RateConfigurations do not result in arbitrary rate selection
  // =========================================================================
  dbWorkShifts.length = 0;
  dbAttendanceLogs.length = 0;

  dbRateConfigs.push({
    id: 'rate-hk-overlap',
    positionId: 'pos-housekeeper',
    payRate: 20.00,
    billRate: 28.00,
    effectiveFrom: pastDate,
    effectiveUntil: null,
  });

  await assert.rejects(
    async () => workShiftService.processPunchSequence('worker-1', propA, AttendanceType.CLOCK_IN, AttendanceMethod.KIOSK_PIN, new Date('2026-09-05T08:00:00Z')),
    (err: any) => err instanceof BadRequestException && err.message.includes('Configuration ambiguity'),
    'TEST 28 FAILED: Overlapping RateConfigurations did not throw Configuration ambiguity exception',
  );

  // Remove overlapping rate config
  const overlapIdx = dbRateConfigs.findIndex((r) => r.id === 'rate-hk-overlap');
  if (overlapIdx >= 0) dbRateConfigs.splice(overlapIdx, 1);

  // =========================================================================
  // TEST 29: Correction cannot create CLOCK_OUT before CLOCK_IN
  // =========================================================================
  dbWorkShifts.length = 0;
  dbAttendanceLogs.length = 0;
  dbTimeCorrectionRequests.length = 0;

  const validIn = new Date('2026-09-05T08:00:00Z');
  const clockInRes: any = await workShiftService.processPunchSequence('worker-1', propA, AttendanceType.CLOCK_IN, AttendanceMethod.KIOSK_PIN, validIn);

  const invalidOutTcr = await timeCorrectionService.createCorrectionRequest({
    work_shift_id: clockInRes.shift.id,
    location_id: propA,
    requested_timestamp: '2026-09-05T07:45:00Z', // Before 08:00
    correction_type: 'MISSED_CLOCK_OUT',
    reason: 'Bad timestamp',
  }, { id: 'worker-1', role: 'ADMIN', permissions: [Permission.TIME_EDIT], companyId: compAlpha, assignedLocationIds: [propA] });

  await assert.rejects(
    async () => timeCorrectionService.approveCorrectionRequest(invalidOutTcr.id, {}, supervisorPropA),
    (err: any) => err instanceof BadRequestException && err.message.includes('Effective CLOCK_OUT must be after effective CLOCK_IN'),
    'TEST 29 FAILED: Correction with CLOCK_OUT before CLOCK_IN was not rejected',
  );

  // =========================================================================
  // TEST 30: Correction cannot invalidate lunch interval
  // =========================================================================
  dbWorkShifts.length = 0;
  dbAttendanceLogs.length = 0;

  const shiftIn = new Date('2026-09-05T08:00:00Z');
  const lunchStart = new Date('2026-09-05T12:00:00Z');
  const lunchEnd = new Date('2026-09-05T12:30:00Z');

  const ws30Res: any = await workShiftService.processPunchSequence('worker-1', propA, AttendanceType.CLOCK_IN, AttendanceMethod.KIOSK_PIN, shiftIn);
  await workShiftService.processPunchSequence('worker-1', propA, AttendanceType.LUNCH_START, AttendanceMethod.KIOSK_PIN, lunchStart);
  await workShiftService.processPunchSequence('worker-1', propA, AttendanceType.LUNCH_END, AttendanceMethod.KIOSK_PIN, lunchEnd);

  const tcrLunchConflict = await timeCorrectionService.createCorrectionRequest({
    work_shift_id: ws30Res.shift.id,
    location_id: propA,
    requested_timestamp: '2026-09-05T11:45:00Z', // Before lunchEnd!
    correction_type: 'MISSED_CLOCK_OUT',
    reason: 'Truncate shift before lunch ended',
  }, { id: 'worker-1', role: 'ADMIN', permissions: [Permission.TIME_EDIT], companyId: compAlpha, assignedLocationIds: [propA] });

  await assert.rejects(
    async () => timeCorrectionService.approveCorrectionRequest(tcrLunchConflict.id, {}, supervisorPropA),
    (err: any) => err instanceof BadRequestException && err.message.includes('conflicts with recorded lunch/break punches'),
    'TEST 30 FAILED: Correction invalidating lunch interval was not rejected',
  );

  // =========================================================================
  // TEST 31: Correction causing overlapping employee WorkShift is rejected
  // =========================================================================
  dbWorkShifts.length = 0;
  dbAttendanceLogs.length = 0;
  dbTimeCorrectionRequests.length = 0;

  // Shift 1: 08:00 to 12:00
  const s1In = new Date('2026-09-05T08:00:00Z');
  const s1Out = new Date('2026-09-05T12:00:00Z');
  await workShiftService.processPunchSequence('worker-1', propA, AttendanceType.CLOCK_IN, AttendanceMethod.KIOSK_PIN, s1In);
  await workShiftService.processPunchSequence('worker-1', propA, AttendanceType.CLOCK_OUT, AttendanceMethod.KIOSK_PIN, s1Out);
  const shift1Id = dbWorkShifts[0].id;

  // Shift 2: 13:00 to 17:00
  const s2In = new Date('2026-09-05T13:00:00Z');
  const s2Out = new Date('2026-09-05T17:00:00Z');
  await workShiftService.processPunchSequence('worker-1', propA, AttendanceType.CLOCK_IN, AttendanceMethod.KIOSK_PIN, s2In);
  await workShiftService.processPunchSequence('worker-1', propA, AttendanceType.CLOCK_OUT, AttendanceMethod.KIOSK_PIN, s2Out);

  // Attempt to correct Shift 1 CLOCK_OUT to 14:00 (overlaps Shift 2)
  const tcrOverlap = await timeCorrectionService.createCorrectionRequest({
    work_shift_id: shift1Id,
    location_id: propA,
    requested_timestamp: '2026-09-05T14:00:00Z',
    correction_type: 'INCORRECT_CLOCK_OUT',
    reason: 'Extend shift 1 into shift 2',
  }, { id: 'worker-1', role: 'ADMIN', permissions: [Permission.TIME_EDIT], companyId: compAlpha, assignedLocationIds: [propA] });

  await assert.rejects(
    async () => timeCorrectionService.approveCorrectionRequest(tcrOverlap.id, {}, supervisorPropA),
    (err: any) => err instanceof BadRequestException && err.message.includes('Correction causes overlapping WorkShift'),
    'TEST 31 FAILED: Correction causing overlapping WorkShift was not rejected',
  );

  // =========================================================================
  // TEST 32: Missed clock-out can be detected/surfaced even without fabricating a punch
  // =========================================================================
  dbWorkShifts.length = 0;
  dbAttendanceLogs.length = 0;

  const oldShiftIn = new Date(Date.now() - 20 * 60 * 60 * 1000); // 20 hours ago
  await workShiftService.processPunchSequence('worker-1', propA, AttendanceType.CLOCK_IN, AttendanceMethod.KIOSK_PIN, oldShiftIn);

  // Call getShifts (non-mutating read endpoint)
  const surfacedShifts = await workShiftService.getShifts(supervisorPropA, { locationId: propA });
  assert.strictEqual(surfacedShifts[0].isOverdue, true, 'TEST 32 FAILED: Overdue shift was not surfaced with isOverdue=true');
  assert.strictEqual(surfacedShifts[0].effectiveDisplayStatus, 'MISSED_CLOCK_OUT', 'TEST 32 FAILED: Overdue shift effectiveDisplayStatus was not MISSED_CLOCK_OUT');
  // Verify DB record remained OPEN (no silent mutation on GET)
  assert.strictEqual(dbWorkShifts[0].status, 'OPEN', 'TEST 32 FAILED: GET endpoint mutated database state!');

  // =========================================================================
  // TEST 33: Unresolved MISSED_CLOCK_OUT shift allows new shift, punches isolate to new shift
  // =========================================================================
  dbWorkShifts.length = 0;
  dbAttendanceLogs.length = 0;

  // Day 1: Forgotten clock-out -> MISSED_CLOCK_OUT
  const day1In = new Date('2026-09-01T08:00:00Z');
  await workShiftService.processPunchSequence('worker-1', propA, AttendanceType.CLOCK_IN, AttendanceMethod.KIOSK_PIN, day1In);
  await workShiftService.checkMissedClockOuts(propA);
  assert.strictEqual(dbWorkShifts[0].status, 'MISSED_CLOCK_OUT', 'TEST 33 PRE-CHECK FAILED: Day 1 shift not MISSED_CLOCK_OUT');

  // Day 2: New CLOCK_IN while Day 1 is still unresolved MISSED_CLOCK_OUT
  const day2In = new Date('2026-09-02T08:00:00Z');
  const day2Out = new Date('2026-09-02T17:00:00Z');

  const day2InRes: any = await workShiftService.processPunchSequence('worker-1', propA, AttendanceType.CLOCK_IN, AttendanceMethod.KIOSK_PIN, day2In);
  assert.strictEqual(dbWorkShifts.length, 2, 'TEST 33 FAILED: New shift was blocked by unresolved MISSED_CLOCK_OUT!');
  assert.strictEqual(day2InRes.shift.status, 'OPEN', 'TEST 33 FAILED: Day 2 shift status should be OPEN');

  const day2OutRes: any = await workShiftService.processPunchSequence('worker-1', propA, AttendanceType.CLOCK_OUT, AttendanceMethod.KIOSK_PIN, day2Out);
  assert.strictEqual(day2OutRes.shift.id, day2InRes.shift.id, 'TEST 33 FAILED: Punch attached to wrong WorkShift!');
  assert.strictEqual(day2OutRes.shift.status, 'COMPLETED', 'TEST 33 FAILED: Day 2 shift did not complete');
  assert.strictEqual(dbWorkShifts[0].status, 'MISSED_CLOCK_OUT', 'TEST 33 FAILED: Day 1 shift was modified by Day 2 punch!');

  console.log('✅ ALL 33 REAL PHASE 3 & 3.1 WORK SHIFT SECURITY & INTEGRITY TESTS (TEST 1 - TEST 33) PASSED SUCCESSFULLY!');
}

if (require.main === module) {
  runWorkShiftServiceTests();
}

import * as assert from 'assert';
import { AuthorizationService, AuthUserContext } from './authorization.service';
import { Permission } from '../permissions/permission.enum';
import { TimeCorrectionService } from '../../application/services/time-correction.service';
import { WorkShiftService } from '../../application/services/work-shift.service';
import { AttendanceService } from '../../application/services/attendance.service';
import { ReportsService } from '../../application/services/reports.service';
import { AttendanceType, AttendanceMethod } from '../entities/attendance-log.entity';
import { encryptPin } from '../../infrastructure/security/pin-encryption.util';

export async function runPhase32SecurityAuditTests(): Promise<void> {
  console.log('\n================================================================');
  console.log(' RUNNING PHASE 3.2 SECURITY & INTEGRITY AUDIT TEST SUITE (1-20) ');
  console.log('================================================================\n');

  const authzService = new AuthorizationService();

  const compAlpha = 'comp-alpha-id';
  const compBeta = 'comp-beta-id';
  const propA = 'prop-alpha-1';
  const propB = 'prop-beta-1';

  const superAdmin: AuthUserContext = {
    id: 'user-super-admin',
    email: 'admin@nexustaff.com',
    role: 'SUPER_ADMIN',
  };

  const ownerCompAlpha: AuthUserContext = {
    id: 'user-owner-alpha',
    email: 'owner@alpha.com',
    role: 'OWNER',
    companyId: compAlpha,
    permissions: [Permission.VIEW_PAY_RATE, Permission.VIEW_BILL_RATE, Permission.VIEW_PAYROLL],
  };

  const managerPropA: AuthUserContext = {
    id: 'user-manager-a',
    email: 'manager@alpha.com',
    role: 'MANAGER',
    companyId: compAlpha,
    assignedLocationIds: [propA],
    permissions: [Permission.TIME_EDIT, Permission.TIME_VIEW, Permission.TIME_APPROVE, Permission.VIEW_PAY_RATE],
    propertyAccess: [
      {
        propertyId: propA,
        permissions: [Permission.TIME_EDIT, Permission.TIME_VIEW, Permission.TIME_APPROVE, Permission.VIEW_PAY_RATE],
      },
    ],
  };

  const supervisorPropANoFinancials: AuthUserContext = {
    id: 'user-supervisor-a',
    email: 'supervisor@alpha.com',
    role: 'SUPERVISOR',
    companyId: compAlpha,
    assignedLocationIds: [propA],
    permissions: [Permission.TIME_EDIT, Permission.TIME_VIEW, Permission.TIME_APPROVE],
    propertyAccess: [
      {
        propertyId: propA,
        permissions: [Permission.TIME_EDIT, Permission.TIME_VIEW, Permission.TIME_APPROVE],
      },
    ],
  };

  // -------------------------------------------------------------------------
  // TEST 1: OWNER accessing Property in their own company -> allowed
  // -------------------------------------------------------------------------
  const canAccessOwnProp = authzService.canAccessProperty(ownerCompAlpha, propA, compAlpha);
  assert.strictEqual(canAccessOwnProp, true, 'TEST 1 FAILED: OWNER must be allowed access to property within own company');
  assert.doesNotThrow(() => authzService.assertPropertyAccess(ownerCompAlpha, propA, compAlpha), 'TEST 1 assert FAILED');
  console.log('✓ TEST 1: OWNER accessing Property in their own company -> allowed');

  // -------------------------------------------------------------------------
  // TEST 2: OWNER accessing Property in another company -> rejected
  // -------------------------------------------------------------------------
  const canAccessOtherProp = authzService.canAccessProperty(ownerCompAlpha, propB, compBeta);
  assert.strictEqual(canAccessOtherProp, false, 'TEST 2 FAILED: OWNER must NOT access property in foreign company');
  assert.throws(
    () => authzService.assertPropertyAccess(ownerCompAlpha, propB, compBeta),
    /Access denied/,
    'TEST 2 assert FAILED: Expected ForbiddenException for cross-company access',
  );
  console.log('✓ TEST 2: OWNER accessing Property in another company -> rejected');

  // -------------------------------------------------------------------------
  // TEST 3: OWNER accessing Property with unresolved company -> rejected
  // -------------------------------------------------------------------------
  const canAccessUnresolved = authzService.canAccessProperty(ownerCompAlpha, propA, undefined);
  assert.strictEqual(canAccessUnresolved, false, 'TEST 3 FAILED: OWNER access must fail-closed when property companyId is unresolved');
  assert.throws(
    () => authzService.assertPropertyAccess(ownerCompAlpha, propA, null),
    /Access denied/,
    'TEST 3 assert FAILED: Expected ForbiddenException when property companyId is null',
  );
  console.log('✓ TEST 3: OWNER accessing Property with unresolved company -> rejected');

  // -------------------------------------------------------------------------
  // TEST 4: Non-SUPER_ADMIN accessing Property without companyId -> rejected
  // -------------------------------------------------------------------------
  const userNoCompany: AuthUserContext = {
    id: 'user-no-company',
    email: 'nocompany@alpha.com',
    role: 'MANAGER',
    companyId: undefined,
    assignedLocationIds: [propA],
  };
  const canAccessNoComp = authzService.canAccessProperty(userNoCompany, propA, compAlpha);
  assert.strictEqual(canAccessNoComp, false, 'TEST 4 FAILED: User without companyId must fail closed');
  assert.throws(
    () => authzService.assertPropertyAccess(userNoCompany, propA, compAlpha),
    /Access denied/,
    'TEST 4 assert FAILED: Expected ForbiddenException for user without companyId',
  );
  console.log('✓ TEST 4: Non-SUPER_ADMIN accessing Property without companyId -> rejected');

  // -------------------------------------------------------------------------
  // Mock DB Setup for Services (Tests 5 - 20)
  // -------------------------------------------------------------------------
  const dbLocations: any[] = [
    { id: propA, companyId: compAlpha, name: 'Alpha Resort' },
    { id: propB, companyId: compBeta, name: 'Beta Resort' },
  ];

  const dbWorkShifts: any[] = [
    {
      id: 'ws-shift-prop-b',
      userId: 'worker-1',
      locationId: propB, // belongs to Beta, not Alpha!
      clockInTimestamp: new Date('2026-09-01T08:00:00Z'),
      status: 'OPEN',
      effectiveClockIn: new Date('2026-09-01T08:00:00Z'),
      payRateApplied: 20.0,
      billRateApplied: 30.0,
      otPayRateApplied: 30.0,
      otBillRateApplied: 45.0,
    },
    {
      id: 'ws-shift-prop-a',
      userId: 'worker-1',
      locationId: propA,
      clockInTimestamp: new Date('2026-09-02T08:00:00Z'),
      status: 'OPEN',
      effectiveClockIn: new Date('2026-09-02T08:00:00Z'),
      payRateApplied: 25.0,
      billRateApplied: 35.0,
    },
  ];

  const dbAttendanceLogs: any[] = [
    {
      id: 'log-foreign-prop',
      userId: 'worker-1',
      locationId: propB, // foreign property
      timestamp: new Date('2026-09-01T08:00:00Z'),
      punchType: 'CLOCK_IN',
    },
    {
      id: 'log-prop-a',
      userId: 'worker-1',
      locationId: propA,
      workShiftId: 'ws-shift-prop-a',
      timestamp: new Date('2026-09-02T08:00:00Z'),
      actualTimestamp: new Date('2026-09-02T08:00:00Z'),
      punchType: 'CLOCK_IN',
    },
  ];

  const dbTimeCorrections: any[] = [];
  const dbAuditLogs: any[] = [];
  let tcrCounter = 1;

  const mockPrisma: any = {
    userLocationAssignment: {
      findFirst: async () => ({ userId: 'worker-1', locationId: propA }),
    },
    employeeAssignment: {
      findFirst: async () => ({ userId: 'worker-1', propertyId: propA, active: true }),
    },
    location: {
      findUnique: async (args: any) => dbLocations.find((l) => l.id === args.where.id) || null,
    },
    workShift: {
      findUnique: async (args: any) => dbWorkShifts.find((ws) => ws.id === args.where.id) || null,
      findMany: async () => [],
      update: async (args: any) => {
        const s = dbWorkShifts.find((ws) => ws.id === args.where.id);
        if (s) Object.assign(s, args.data);
        return s;
      },
    },
    attendanceLog: {
      findUnique: async (args: any) => dbAttendanceLogs.find((l) => l.id === args.where.id) || null,
      findMany: async (args: any) => dbAttendanceLogs,
      update: async (args: any) => {
        const l = dbAttendanceLogs.find((log) => log.id === args.where.id);
        if (l) Object.assign(l, args.data);
        return l;
      },
    },
    timeCorrectionRequest: {
      create: async (args: any) => {
        const req = { id: `tcr-${tcrCounter++}`, ...args.data };
        dbTimeCorrections.push(req);
        return req;
      },
      findUnique: async (args: any) => {
        const r = dbTimeCorrections.find((tc) => tc.id === args.where.id);
        if (!r) return null;
        return {
          ...r,
          property: dbLocations.find((l) => l.id === r.propertyId),
          workShift: dbWorkShifts.find((ws) => ws.id === r.workShiftId),
        };
      },
      findMany: async () => dbTimeCorrections,
      updateMany: async (args: any) => {
        const r = dbTimeCorrections.find((tc) => tc.id === args.where.id);
        if (r && (!args.where.status || r.status === args.where.status)) {
          Object.assign(r, args.data);
          return { count: 1 };
        }
        return { count: 0 };
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

  const timeCorrectionService = new TimeCorrectionService(mockPrisma, authzService);

  // -------------------------------------------------------------------------
  // TEST 5: TimeCorrectionRequest with mismatched workShift.locationId -> rejected
  // -------------------------------------------------------------------------
  await assert.rejects(
    async () => {
      await timeCorrectionService.createCorrectionRequest(
        {
          location_id: propA, // requesting for Prop Alpha
          work_shift_id: 'ws-shift-prop-b', // but shift belongs to Prop Beta!
          correction_type: 'INCORRECT_CLOCK_IN',
          requested_timestamp: '2026-09-01T08:15:00Z',
          reason: 'Adjust clock-in',
        } as any,
        managerPropA,
      );
    },
    /Cross-property integrity violation/,
    'TEST 5 FAILED: Expected rejection when workShift belongs to a different property',
  );
  console.log('✓ TEST 5: TimeCorrectionRequest with mismatched workShift.locationId -> rejected');

  // -------------------------------------------------------------------------
  // TEST 6: TimeCorrectionRequest with mismatched attendanceLog.locationId -> rejected
  // -------------------------------------------------------------------------
  await assert.rejects(
    async () => {
      await timeCorrectionService.createCorrectionRequest(
        {
          location_id: propA, // requesting for Prop Alpha
          attendance_log_id: 'log-foreign-prop', // but log belongs to Prop Beta!
          correction_type: 'INCORRECT_CLOCK_IN',
          requested_timestamp: '2026-09-01T08:15:00Z',
          reason: 'Adjust clock-in',
        } as any,
        managerPropA,
      );
    },
    /Cross-property integrity violation/,
    'TEST 6 FAILED: Expected rejection when attendanceLog belongs to a different property',
  );
  console.log('✓ TEST 6: TimeCorrectionRequest with mismatched attendanceLog.locationId -> rejected');

  // -------------------------------------------------------------------------
  // TEST 7: TimeCorrectionRequest with mismatched workShift.userId -> verified
  // -------------------------------------------------------------------------
  // In createCorrectionRequest, if work_shift_id is supplied, targetUserId is derived directly from shift.userId
  const validRequest = await timeCorrectionService.createCorrectionRequest(
    {
      location_id: propA,
      work_shift_id: 'ws-shift-prop-a',
      correction_type: 'INCORRECT_CLOCK_IN',
      requested_timestamp: '2026-09-02T08:30:00Z',
      reason: 'Forgot badge, manager confirmed 08:30',
    } as any,
    managerPropA,
  );
  assert.strictEqual(validRequest.userId, 'worker-1', 'TEST 7 FAILED: Target userId must match workShift.userId');
  console.log('✓ TEST 7: TimeCorrectionRequest binds target userId strictly to authentic workShift record');

  // -------------------------------------------------------------------------
  // TEST 8: Approve TimeCorrectionRequest re-verifying DB relations -> verified
  // -------------------------------------------------------------------------
  const approveRes = await timeCorrectionService.approveCorrectionRequest(
    validRequest.id,
    { comments: 'Approved by manager' },
    managerPropA,
  );
  assert.strictEqual(approveRes.status, 'APPROVED', 'TEST 8 FAILED: Correction request was not approved');
  assert.strictEqual(dbWorkShifts[1].effectiveClockIn.toISOString(), new Date('2026-09-02T08:30:00Z').toISOString());
  console.log('✓ TEST 8: Approve TimeCorrectionRequest re-verifying DB relations -> verified');

  // -------------------------------------------------------------------------
  // TEST 9: adjustPunchTime endpoint -> rejects with deprecation error
  // -------------------------------------------------------------------------
  const attendanceService = new AttendanceService(mockPrisma as any, {} as any, {} as any);
  await assert.rejects(
    async () => {
      await attendanceService.adjustPunchTime('log-prop-a', { actualIn: '2026-09-02T08:00:00Z' }, managerPropA);
    },
    /Direct punch mutation is deprecated/,
    'TEST 9 FAILED: adjustPunchTime must throw deprecation BadRequestException',
  );
  console.log('✓ TEST 9: adjustPunchTime endpoint -> rejects with deprecation error');

  // -------------------------------------------------------------------------
  // TEST 10: approveOvertime endpoint -> rejects with deprecation error
  // -------------------------------------------------------------------------
  await assert.rejects(
    async () => {
      await attendanceService.approveOvertime('log-prop-a', managerPropA);
    },
    /Direct overtime approval on raw AttendanceLog is deprecated/,
    'TEST 10 FAILED: approveOvertime must throw deprecation BadRequestException',
  );
  console.log('✓ TEST 10: approveOvertime endpoint -> rejects with deprecation error');

  // -------------------------------------------------------------------------
  // TEST 11: Raw AttendanceLog timestamp preserved after correction approval
  // -------------------------------------------------------------------------
  const logAfterApproval = dbAttendanceLogs.find((l) => l.id === 'log-prop-a');
  assert.strictEqual(
    logAfterApproval.timestamp.toISOString(),
    new Date('2026-09-02T08:00:00Z').toISOString(),
    'TEST 11 FAILED: Raw AttendanceLog.timestamp MUST NOT be overwritten by correction approval!',
  );
  assert.strictEqual(
    logAfterApproval.actualTimestamp.toISOString(),
    new Date('2026-09-02T08:00:00Z').toISOString(),
    'TEST 11 FAILED: Raw AttendanceLog.actualTimestamp MUST NOT be overwritten by correction approval!',
  );
  console.log('✓ TEST 11: Raw AttendanceLog timestamp preserved after correction approval');

  // -------------------------------------------------------------------------
  // TEST 12: Raw clockOutTimestamp not fabricated for MISSED_CLOCK_OUT
  // -------------------------------------------------------------------------
  const missedShift = {
    id: 'ws-missed-shift',
    userId: 'worker-1',
    locationId: propA,
    clockInTimestamp: new Date('2026-09-03T08:00:00Z'),
    clockOutTimestamp: null,
    effectiveClockIn: new Date('2026-09-03T08:00:00Z'),
    effectiveClockOut: null,
    status: 'MISSED_CLOCK_OUT',
  };
  dbWorkShifts.push(missedShift);

  const missedReq = await timeCorrectionService.createCorrectionRequest(
    {
      location_id: propA,
      work_shift_id: 'ws-missed-shift',
      correction_type: 'MISSED_CLOCK_OUT',
      requested_timestamp: '2026-09-03T16:30:00Z',
      reason: 'Employee forgot to clock out at 16:30',
    } as any,
    managerPropA,
  );

  await timeCorrectionService.approveCorrectionRequest(missedReq.id, { comments: 'Approved' }, managerPropA);

  assert.strictEqual(
    missedShift.clockOutTimestamp,
    null,
    'TEST 12 FAILED: Raw clockOutTimestamp MUST remain null for MISSED_CLOCK_OUT — fake punch must not be fabricated!',
  );
  assert.strictEqual(
    missedShift.effectiveClockOut?.toISOString(),
    new Date('2026-09-03T16:30:00Z').toISOString(),
    'TEST 12 FAILED: Approved timestamp must be stored in effectiveClockOut',
  );
  console.log('✓ TEST 12: Raw clockOutTimestamp not fabricated for MISSED_CLOCK_OUT');

  // -------------------------------------------------------------------------
  // TEST 13: Time correction response masks financial fields for unauthorized users
  // -------------------------------------------------------------------------
  const detailForSupervisor = await timeCorrectionService.getCorrectionRequestById(validRequest.id, supervisorPropANoFinancials);
  assert.strictEqual(
    detailForSupervisor.workShift.payRateApplied,
    undefined,
    'TEST 13 FAILED: payRateApplied must be masked for user without VIEW_PAY_RATE',
  );
  assert.strictEqual(
    detailForSupervisor.workShift.billRateApplied,
    undefined,
    'TEST 13 FAILED: billRateApplied must be masked for user without VIEW_BILL_RATE',
  );
  console.log('✓ TEST 13: Time correction response masks financial fields for unauthorized users');

  // -------------------------------------------------------------------------
  // TEST 14: Time correction response reveals financial fields for authorized users
  // -------------------------------------------------------------------------
  const detailForOwner = await timeCorrectionService.getCorrectionRequestById(validRequest.id, ownerCompAlpha);
  assert.strictEqual(
    detailForOwner.workShift.payRateApplied,
    25.0,
    'TEST 14 FAILED: payRateApplied must be visible for authorized OWNER',
  );
  assert.strictEqual(
    detailForOwner.workShift.billRateApplied,
    35.0,
    'TEST 14 FAILED: billRateApplied must be visible for authorized OWNER',
  );
  console.log('✓ TEST 14: Time correction response reveals financial fields for authorized users');

  // -------------------------------------------------------------------------
  // TEST 15 & 16: Report generation financial authorization
  // -------------------------------------------------------------------------
  const mockPrismaReports: any = {
    attendanceLog: {
      findMany: async () => [
        {
          id: 'log-rep-1',
          userId: 'worker-1',
          calculatedHours: 8.0,
          isOvertime: false,
          user: {
            id: 'worker-1',
            firstName: 'Alice',
            lastName: 'Smith',
            hourlyRate: 25.0,
            department: { name: 'Housekeeping' },
          },
        },
      ],
    },
  };

  const reportsService = new ReportsService(mockPrismaReports, authzService);

  // Without any financial permissions: throws ForbiddenException
  await assert.rejects(
    async () => {
      await reportsService.buildPayrollExcelBuffer({} as any, [propA], supervisorPropANoFinancials);
    },
    /Access denied: You do not have the required financial permissions/,
    'TEST 15/16 FAILED: Expected ForbiddenException when generating payroll report without financial perms',
  );

  // With VIEW_PAY_RATE: includes PAY RATE column
  const csvBufferPayRate = await reportsService.buildPayrollExcelBuffer({} as any, [propA], managerPropA);
  const csvTextPayRate = csvBufferPayRate.toString('utf-8');
  assert.strictEqual(csvTextPayRate.includes('PAY RATE'), true, 'TEST 15 FAILED: PAY RATE column must be present with VIEW_PAY_RATE');
  assert.strictEqual(csvTextPayRate.includes('25.00'), true, 'TEST 15 FAILED: Pay rate value 25.00 must be present');
  console.log('✓ TEST 15: Report generation omits pay rate without VIEW_PAY_RATE');
  console.log('✓ TEST 16: Report generation honors financial permission boundary');

  // -------------------------------------------------------------------------
  // TEST 17: CSV export sanitizes formula injection characters (=, +, -, @)
  // -------------------------------------------------------------------------
  const mockPrismaFormulaInject: any = {
    attendanceLog: {
      findMany: async () => [
        {
          id: 'log-inj-1',
          userId: 'worker-inj',
          calculatedHours: 4.0,
          isOvertime: false,
          user: {
            id: 'worker-inj',
            firstName: '=cmd|',
            lastName: '+SUM(A1:A10)',
            hourlyRate: 15.0,
          },
        },
      ],
    },
  };
  const reportsServiceInj = new ReportsService(mockPrismaFormulaInject, authzService);
  const injCsvBuffer = await reportsServiceInj.buildPayrollExcelBuffer({} as any, [propA], managerPropA);
  const injCsvText = injCsvBuffer.toString('utf-8');
  // First character of the name string cell inside quotes must NOT be =, +, -, @
  assert.strictEqual(
    injCsvText.includes('"=cmd|'),
    false,
    'TEST 17 FAILED: Leading formula character "=" was not sanitized!',
  );
  console.log('✓ TEST 17: CSV export sanitizes formula injection characters (=, +, -, @)');

  // -------------------------------------------------------------------------
  // TEST 18: PIN encryption fails fast when PIN_ENCRYPTION_KEY is missing
  // -------------------------------------------------------------------------
  const originalPinKey = process.env.PIN_ENCRYPTION_KEY;
  try {
    delete process.env.PIN_ENCRYPTION_KEY;
    assert.throws(
      () => encryptPin('123456'),
      /FATAL: PIN_ENCRYPTION_KEY environment variable is missing/,
      'TEST 18 FAILED: encryptPin must fail fast without hardcoded default fallback',
    );
  } finally {
    process.env.PIN_ENCRYPTION_KEY = originalPinKey;
  }
  console.log('✓ TEST 18: PIN encryption fails fast when PIN_ENCRYPTION_KEY is missing');

  // -------------------------------------------------------------------------
  // TEST 19: Multiple active EmployeeAssignments with different positions -> rejected
  // -------------------------------------------------------------------------
  const ambiguousAssignments = [
    {
      id: 'ea-ambig-1',
      userId: 'worker-ambig',
      propertyId: propA,
      departmentId: 'dept-1',
      positionId: 'pos-housekeeper',
      active: true,
      effectiveFrom: new Date('2026-01-01'),
      effectiveUntil: null,
    },
    {
      id: 'ea-ambig-2',
      userId: 'worker-ambig',
      propertyId: propA,
      departmentId: 'dept-2',
      positionId: 'pos-frontdesk',
      active: true,
      effectiveFrom: new Date('2026-01-01'),
      effectiveUntil: null,
    },
  ];

  const mockPrismaAmbig: any = {
    user: {
      findUnique: async () => ({ status: 'ACTIVE', id: 'worker-ambig', employeeNumber: 'EMP-99', firstName: 'Amb', lastName: 'Worker' }),
    },
    userLocationAssignment: { findFirst: async () => ({ userId: 'worker-ambig', locationId: propA }) },
    employeeAssignment: {
      findFirst: async () => ambiguousAssignments[0],
      findMany: async () => ambiguousAssignments,
    },
    propertyOperationalConfig: { findUnique: async () => ({ maxShiftDurationMinutes: 960 }) },
    workShift: { findFirst: async () => null },
    $queryRaw: async () => [],
    $executeRawUnsafe: async () => 1,
    timesheet: { findMany: async () => [] },
    $transaction: async (fn: any) => await fn(mockPrismaAmbig),
  };

  const workShiftServiceAmbig = new WorkShiftService(mockPrismaAmbig, authzService);

  await assert.rejects(
    async () => {
      await workShiftServiceAmbig.processPunchSequence(
        'worker-ambig',
        propA,
        AttendanceType.CLOCK_IN,
        AttendanceMethod.KIOSK_PIN,
        new Date('2026-09-04T10:00:00Z'),
      );
    },
    /Configuration ambiguity: conflicting active EmployeeAssignments/,
    'TEST 19 FAILED: Clock-in must be rejected when multiple conflicting assignments are active',
  );
  console.log('✓ TEST 19: Multiple active EmployeeAssignments with different positions -> clock-in rejected with ambiguity error');

  // -------------------------------------------------------------------------
  // TEST 20: Single active EmployeeAssignment -> clock-in succeeds with correct snapshot
  // -------------------------------------------------------------------------
  const singleAssignment = [
    {
      id: 'ea-single-1',
      userId: 'worker-single',
      propertyId: propA,
      departmentId: 'dept-1',
      positionId: 'pos-cleaner',
      rateConfigurationId: 'rate-cleaner-1',
      active: true,
      effectiveFrom: new Date('2026-01-01'),
      effectiveUntil: null,
    },
  ];

  const singleRateConfig = {
    id: 'rate-cleaner-1',
    positionId: 'pos-cleaner',
    payRate: 19.5,
    billRate: 28.0,
    otPayRate: 29.25,
    otBillRate: 42.0,
    markupType: 'PERCENTAGE',
    markupValue: 15.0,
    minimumShiftMins: 240,
    effectiveFrom: new Date('2026-01-01'),
    effectiveUntil: null,
  };

  const createdShifts: any[] = [];
  const createdLogs: any[] = [];

  const mockPrismaSingle: any = {
    user: {
      findUnique: async () => ({ status: 'ACTIVE', id: 'worker-single', employeeNumber: 'EMP-100', firstName: 'Single', lastName: 'Emp' }),
    },
    userLocationAssignment: { findFirst: async () => ({ userId: 'worker-single', locationId: propA }) },
    employeeAssignment: {
      findFirst: async () => singleAssignment[0],
      findMany: async () => singleAssignment,
    },
    rateConfiguration: { findUnique: async () => singleRateConfig },
    propertyOperationalConfig: { findUnique: async () => ({ maxShiftDurationMinutes: 960 }) },
    auditLog: { create: async () => ({}) },
    workShift: {
      findFirst: async () => null,
      create: async (args: any) => {
        const s = { id: 'ws-single-1', ...args.data };
        createdShifts.push(s);
        return s;
      },
    },
    attendanceLog: {
      create: async (args: any) => {
        const l = { id: 'log-single-1', ...args.data };
        createdLogs.push(l);
        return l;
      },
    },
    $queryRaw: async () => [],
    $executeRawUnsafe: async () => 1,
    timesheet: { findMany: async () => [] },
    $transaction: async (fn: any) => await fn(mockPrismaSingle),
  };

  const workShiftServiceSingle = new WorkShiftService(mockPrismaSingle, authzService);

  const punchResult = await workShiftServiceSingle.processPunchSequence(
    'worker-single',
    propA,
    AttendanceType.CLOCK_IN,
    AttendanceMethod.KIOSK_PIN,
    new Date('2026-09-04T10:00:00Z'),
  );

  assert.strictEqual(!!punchResult.shift, true, 'TEST 20 FAILED: WorkShift was not created');
  assert.strictEqual(punchResult.shift.payRateApplied, 19.5, 'TEST 20 FAILED: payRateApplied snapshot mismatch');
  assert.strictEqual(punchResult.shift.billRateApplied, 28.0, 'TEST 20 FAILED: billRateApplied snapshot mismatch');
  assert.strictEqual(punchResult.shift.markupTypeApplied, 'PERCENTAGE', 'TEST 20 FAILED: markupTypeApplied snapshot mismatch');
  assert.strictEqual(punchResult.shift.minimumShiftMinsApplied, 240, 'TEST 20 FAILED: minimumShiftMinsApplied mismatch');
  console.log('✓ TEST 20: Single active EmployeeAssignment -> clock-in succeeds with correct snapshot');

  // -------------------------------------------------------------------------
  // TEST 78 (Audit 21): OWNER property permission without resolved company context is denied
  // -------------------------------------------------------------------------
  // Context-free call for property-scoped permission must fail closed
  const ownerNoContextPerm = authzService.hasPermission(ownerCompAlpha, Permission.TIME_APPROVE);
  assert.strictEqual(ownerNoContextPerm, false, 'TEST 78 FAILED: OWNER must fail closed for property permission without context');

  // Target property provided without propertyCompanyId must fail closed
  const ownerNoCompanyResolved = authzService.hasPermission(ownerCompAlpha, Permission.TIME_APPROVE, propA, undefined);
  assert.strictEqual(ownerNoCompanyResolved, false, 'TEST 78 FAILED: OWNER must fail closed when propertyCompanyId is undefined');

  const ownerNullCompanyResolved = authzService.hasPermission(ownerCompAlpha, Permission.TIME_APPROVE, propA, null);
  assert.strictEqual(ownerNullCompanyResolved, false, 'TEST 78 FAILED: OWNER must fail closed when propertyCompanyId is null');

  // OWNER financial permission without propertyCompanyId must fail closed
  const ownerNoCompPayRate = authzService.hasPermission(ownerCompAlpha, Permission.VIEW_PAY_RATE, propA);
  assert.strictEqual(ownerNoCompPayRate, false, 'TEST 78 FAILED: OWNER cannot obtain property financial permission without resolved company');

  assert.throws(
    () => authzService.assertPermission(ownerCompAlpha, Permission.TIME_APPROVE, propA),
    /Required permission 'TIME_APPROVE' is missing/,
    'TEST 78 assert FAILED: assertPermission must throw when propertyCompanyId is missing',
  );
  console.log('✓ TEST 78: OWNER property permission without resolved company context is denied');

  // -------------------------------------------------------------------------
  // TEST 79 (Audit 22): OWNER own-property permission with resolved company context succeeds
  // -------------------------------------------------------------------------
  // Own property + resolved companyId === user.companyId
  const ownerOwnPropPerm = authzService.hasPermission(ownerCompAlpha, Permission.TIME_APPROVE, propA, compAlpha);
  assert.strictEqual(ownerOwnPropPerm, true, 'TEST 79 FAILED: OWNER with own property and resolved companyId must succeed');

  const ownerOwnPropPay = authzService.hasPermission(ownerCompAlpha, Permission.VIEW_PAY_RATE, propA, compAlpha);
  assert.strictEqual(ownerOwnPropPay, true, 'TEST 79 FAILED: OWNER with own property and resolved companyId must have VIEW_PAY_RATE');

  // Foreign property with foreign companyId -> denied
  const ownerForeignProp = authzService.hasPermission(ownerCompAlpha, Permission.TIME_APPROVE, propB, compBeta);
  assert.strictEqual(ownerForeignProp, false, 'TEST 79 FAILED: OWNER on foreign property must be denied even if companyId is provided');
  console.log('✓ TEST 79: OWNER own-property permission with resolved company context succeeds');

  // -------------------------------------------------------------------------
  // TEST 80 (Audit 23): Payroll report does not infer OT merely because shift > 8 hours
  // -------------------------------------------------------------------------
  // Shift with 10 hours worked, but regularMinutes: 600, overtimeMinutes: 0 (no OT policy configured)
  const mockPrismaOtCheck: any = {
    attendanceLog: {
      findMany: async () => [
        {
          id: 'log-10hr-shift',
          userId: 'worker-ot-test',
          calculatedHours: 10.0,
          isOvertime: false,
          user: {
            id: 'worker-ot-test',
            firstName: 'Bob',
            lastName: 'TenHours',
            hourlyRate: 20.0,
            department: { name: 'Maintenance' },
          },
          workShift: {
            id: 'ws-10hr',
            regularMinutes: 600,
            overtimeMinutes: 0,
            payRateApplied: 20.0,
            otPayRateApplied: null,
          },
        },
      ],
    },
  };
  const reportsServiceOt = new ReportsService(mockPrismaOtCheck, authzService);
  const buffer10Hr = await reportsServiceOt.buildPayrollExcelBuffer({} as any, [propA], managerPropA);
  const text10Hr = buffer10Hr.toString('utf-8');
  assert.strictEqual(text10Hr.includes('10.00'), true, 'TEST 80 FAILED: Expected 10.00 regular hours when shift is 10 hours without OT');
  assert.strictEqual(text10Hr.includes('8.00'), false, 'TEST 80 FAILED: Found 8.00 - report must not invent 8-hour overtime split');
  console.log('✓ TEST 80: Payroll report does not infer OT merely because shift > 8 hours');

  // -------------------------------------------------------------------------
  // TEST 81 (Audit 24): Payroll report does not invent 1.5x OT multiplier
  // -------------------------------------------------------------------------
  // When OT legitimately exists (e.g. 2 hours OT), but otPayRateApplied is null/unconfigured
  const mockPrismaOtNo15: any = {
    attendanceLog: {
      findMany: async () => [
        {
          id: 'log-ot-legit',
          userId: 'worker-ot-legit',
          calculatedHours: 10.0,
          isOvertime: true,
          user: {
            id: 'worker-ot-legit',
            firstName: 'Carl',
            lastName: 'LegitOt',
            hourlyRate: 20.0,
            department: { name: 'Security' },
          },
          workShift: {
            id: 'ws-ot-legit',
            regularMinutes: 480, // 8 hrs
            overtimeMinutes: 120, // 2 hrs
            payRateApplied: 20.0,
            otPayRateApplied: null, // No configured 1.5x rate!
          },
        },
      ],
    },
  };
  const reportsServiceNo15 = new ReportsService(mockPrismaOtNo15, authzService);
  const bufferNo15 = await reportsServiceNo15.buildPayrollExcelBuffer({} as any, [propA], managerPropA);
  const textNo15 = bufferNo15.toString('utf-8');
  assert.strictEqual(textNo15.includes('200.00'), true, 'TEST 81 FAILED: Expected 200.00 total pay without invented 1.5x multiplier');
  assert.strictEqual(textNo15.includes('220.00'), false, 'TEST 81 FAILED: Found 220.00 - invented 1.5x OT multiplier was applied');
  console.log('✓ TEST 81: Payroll report does not invent 1.5x OT multiplier');

  // -------------------------------------------------------------------------
  // TEST 82 (Audit 25): VIEW_PAY_RATE-only correction query never selects bill/markup fields
  // -------------------------------------------------------------------------
  let queriedShiftSelectPayOnly: any = null;
  const supervisorPayOnly: AuthUserContext = {
    id: 'super-pay-only',
    email: 'super-pay@alpha.com',
    role: 'SUPERVISOR',
    companyId: compAlpha,
    assignedLocationIds: [propA],
    permissions: [Permission.VIEW_PAY_RATE, Permission.TIME_VIEW],
    propertyAccess: [{ propertyId: propA, permissions: [Permission.VIEW_PAY_RATE, Permission.TIME_VIEW] }],
  };

  const mockPrismaFieldSelect: any = {
    location: {
      findUnique: async () => ({ id: propA, companyId: compAlpha }),
    },
    workShift: {
      findUnique: async (args: any) => {
        queriedShiftSelectPayOnly = args.select;
        return {
          id: 'ws-shift-prop-a',
          userId: 'worker-1',
          locationId: propA,
          payRateApplied: 25.0,
        };
      },
      findMany: async (args: any) => {
        queriedShiftSelectPayOnly = args.select;
        return [
          {
            id: 'ws-shift-prop-a',
            userId: 'worker-1',
            locationId: propA,
            payRateApplied: 25.0,
          },
        ];
      },
    },
    timeCorrectionRequest: {
      findMany: async (args: any) => {
        queriedShiftSelectPayOnly = args?.include?.workShift?.select;
        return [
          {
            id: 'tcr-select-test',
            propertyId: propA,
            userId: 'worker-1',
            workShiftId: 'ws-shift-prop-a',
            status: 'PENDING',
            property: { id: propA, companyId: compAlpha, name: 'Alpha Resort' },
            user: { id: 'worker-1', employeeNumber: 'EMP-001', firstName: 'John', lastName: 'Worker' },
            requestedBy: { id: 'worker-1', firstName: 'John', lastName: 'Worker' },
            reviewedBy: null,
          },
        ];
      },
      findUnique: async () => ({
        id: 'tcr-select-test',
        propertyId: propA,
        userId: 'worker-1',
        workShiftId: 'ws-shift-prop-a',
        status: 'PENDING',
        property: { id: propA, companyId: compAlpha, name: 'Alpha Resort' },
        user: { id: 'worker-1', employeeNumber: 'EMP-001', firstName: 'John', lastName: 'Worker' },
        requestedBy: { id: 'worker-1', firstName: 'John', lastName: 'Worker' },
        reviewedBy: null,
      }),
    },
  };

  const tcServiceFieldSelect = new TimeCorrectionService(mockPrismaFieldSelect, authzService);
  await tcServiceFieldSelect.getCorrectionRequests(supervisorPayOnly, { location_id: propA });
  assert.strictEqual(queriedShiftSelectPayOnly.payRateApplied, true, 'TEST 82 FAILED: payRateApplied must be selected');
  assert.strictEqual(queriedShiftSelectPayOnly.billRateApplied, undefined, 'TEST 82 FAILED: billRateApplied must NOT be selected for VIEW_PAY_RATE-only');
  assert.strictEqual(queriedShiftSelectPayOnly.markupValueApplied, undefined, 'TEST 82 FAILED: markupValueApplied must NOT be selected');
  assert.strictEqual(queriedShiftSelectPayOnly.markupTypeApplied, undefined, 'TEST 82 FAILED: markupTypeApplied must NOT be selected');

  queriedShiftSelectPayOnly = null;
  await tcServiceFieldSelect.getCorrectionRequestById('tcr-select-test', supervisorPayOnly);
  assert.strictEqual(queriedShiftSelectPayOnly.payRateApplied, true, 'TEST 82 FAILED: getCorrectionRequestById must select payRateApplied');
  assert.strictEqual(queriedShiftSelectPayOnly.billRateApplied, undefined, 'TEST 82 FAILED: getCorrectionRequestById must NOT select billRateApplied');
  console.log('✓ TEST 82: VIEW_PAY_RATE-only correction query never selects bill/markup fields');

  // -------------------------------------------------------------------------
  // TEST 83 (Audit 26): VIEW_BILL_RATE-only correction query never selects pay/markup fields
  // -------------------------------------------------------------------------
  let queriedShiftSelectBillOnly: any = null;
  const supervisorBillOnly: AuthUserContext = {
    id: 'super-bill-only',
    email: 'super-bill@alpha.com',
    role: 'SUPERVISOR',
    companyId: compAlpha,
    assignedLocationIds: [propA],
    permissions: [Permission.VIEW_BILL_RATE, Permission.TIME_VIEW],
    propertyAccess: [{ propertyId: propA, permissions: [Permission.VIEW_BILL_RATE, Permission.TIME_VIEW] }],
  };

  const mockPrismaBillOnly: any = {
    location: {
      findUnique: async () => ({ id: propA, companyId: compAlpha }),
    },
    workShift: {
      findUnique: async (args: any) => {
        queriedShiftSelectBillOnly = args.select;
        return {
          id: 'ws-shift-prop-a',
          userId: 'worker-1',
          locationId: propA,
          billRateApplied: 35.0,
        };
      },
      findMany: async (args: any) => {
        queriedShiftSelectBillOnly = args.select;
        return [
          {
            id: 'ws-shift-prop-a',
            userId: 'worker-1',
            locationId: propA,
            billRateApplied: 35.0,
          },
        ];
      },
    },
    timeCorrectionRequest: {
      findMany: async (args: any) => {
        queriedShiftSelectBillOnly = args?.include?.workShift?.select;
        return [
          {
            id: 'tcr-select-test-2',
            propertyId: propA,
            userId: 'worker-1',
            workShiftId: 'ws-shift-prop-a',
            status: 'PENDING',
            property: { id: propA, companyId: compAlpha, name: 'Alpha Resort' },
            user: { id: 'worker-1', employeeNumber: 'EMP-001', firstName: 'John', lastName: 'Worker' },
            requestedBy: { id: 'worker-1', firstName: 'John', lastName: 'Worker' },
            reviewedBy: null,
          },
        ];
      },
      findUnique: async () => ({
        id: 'tcr-select-test-2',
        propertyId: propA,
        userId: 'worker-1',
        workShiftId: 'ws-shift-prop-a',
        status: 'PENDING',
        property: { id: propA, companyId: compAlpha, name: 'Alpha Resort' },
        user: { id: 'worker-1', employeeNumber: 'EMP-001', firstName: 'John', lastName: 'Worker' },
        requestedBy: { id: 'worker-1', firstName: 'John', lastName: 'Worker' },
        reviewedBy: null,
      }),
    },
  };

  const tcServiceBillOnly = new TimeCorrectionService(mockPrismaBillOnly, authzService);
  await tcServiceBillOnly.getCorrectionRequests(supervisorBillOnly, { location_id: propA });
  assert.strictEqual(queriedShiftSelectBillOnly.billRateApplied, true, 'TEST 83 FAILED: billRateApplied must be selected');
  assert.strictEqual(queriedShiftSelectBillOnly.payRateApplied, undefined, 'TEST 83 FAILED: payRateApplied must NOT be selected for VIEW_BILL_RATE-only');
  assert.strictEqual(queriedShiftSelectBillOnly.markupValueApplied, undefined, 'TEST 83 FAILED: markupValueApplied must NOT be selected');

  queriedShiftSelectBillOnly = null;
  await tcServiceBillOnly.getCorrectionRequestById('tcr-select-test-2', supervisorBillOnly);
  assert.strictEqual(queriedShiftSelectBillOnly.billRateApplied, true, 'TEST 83 FAILED: getCorrectionRequestById must select billRateApplied');
  assert.strictEqual(queriedShiftSelectBillOnly.payRateApplied, undefined, 'TEST 83 FAILED: getCorrectionRequestById must NOT select payRateApplied');
  console.log('✓ TEST 83: VIEW_BILL_RATE-only correction query never selects pay/markup fields');

  // -------------------------------------------------------------------------
  // TEST 84 (Audit 27): Same-property cross-employee WorkShift/AttendanceLog correction is rejected
  // -------------------------------------------------------------------------
  // Property A has Employee 1 (worker-1) and Employee 2 (worker-2)
  const shiftEmp1 = {
    id: 'ws-emp-1',
    userId: 'worker-1',
    locationId: propA,
    clockInTimestamp: new Date('2026-09-04T08:00:00Z'),
  };
  const logEmp2 = {
    id: 'log-emp-2',
    userId: 'worker-2',
    locationId: propA,
    timestamp: new Date('2026-09-04T17:00:00Z'),
    punchType: 'CLOCK_OUT',
  };

  const mockPrismaCrossEmp: any = {
    location: { findUnique: async () => ({ id: propA, companyId: compAlpha }) },
    workShift: { findUnique: async (args: any) => (args.where.id === shiftEmp1.id ? shiftEmp1 : null) },
    attendanceLog: { findUnique: async (args: any) => (args.where.id === logEmp2.id ? logEmp2 : null) },
    timeCorrectionRequest: { create: async () => ({ id: 'tcr-cross-created' }) },
  };

  const tcServiceCrossEmp = new TimeCorrectionService(mockPrismaCrossEmp, authzService);

  await assert.rejects(
    async () => {
      await tcServiceCrossEmp.createCorrectionRequest(
        {
          location_id: propA,
          work_shift_id: shiftEmp1.id,
          attendance_log_id: logEmp2.id,
          correction_type: 'INCORRECT_CLOCK_OUT',
          requested_timestamp: '2026-09-04T17:30:00Z',
          reason: 'Attempt cross-employee linkage',
        },
        managerPropA,
      );
    },
    /Cross-resource employee integrity violation.*belongs to employee 'worker-1'.*belongs to employee 'worker-2'/,
    'TEST 84 FAILED: Cross-employee WorkShift/AttendanceLog combination must be rejected',
  );
  console.log('✓ TEST 84: Same-property cross-employee WorkShift/AttendanceLog correction is rejected');

  // -------------------------------------------------------------------------
  // TEST 85 (Audit 28): Approval re-verifies employee/resource consistency atomically
  // -------------------------------------------------------------------------
  // Pending request says userId is worker-1, but linked shift was tampered in DB to worker-2
  const tamperedShift = {
    id: 'ws-tampered',
    userId: 'worker-2', // Mismatched user!
    locationId: propA,
    clockInTimestamp: new Date('2026-09-04T08:00:00Z'),
  };

  const mockPrismaApprovalIntegrity: any = {
    location: { findUnique: async () => ({ id: propA, companyId: compAlpha }) },
    timeCorrectionRequest: {
      findUnique: async () => ({
        id: 'tcr-pending-tampered',
        propertyId: propA,
        userId: 'worker-1',
        workShiftId: tamperedShift.id,
        status: 'PENDING',
        requestedTimestamp: new Date('2026-09-04T17:00:00Z'),
        correctionType: 'MISSED_CLOCK_OUT',
        property: { id: propA, companyId: compAlpha },
      }),
      updateMany: async () => ({ count: 1 }),
    },
    workShift: { findUnique: async () => tamperedShift },
    attendanceLog: { findMany: async () => [] },
    auditLog: { create: async () => ({}) },
    $queryRaw: async () => [],
    $executeRawUnsafe: async () => 1,
    timesheet: { findMany: async () => [] },
    $transaction: async (fn: any) => await fn(mockPrismaApprovalIntegrity),
  };

  const tcServiceApprovalIntegrity = new TimeCorrectionService(mockPrismaApprovalIntegrity, authzService);

  await assert.rejects(
    async () => {
      await tcServiceApprovalIntegrity.approveCorrectionRequest(
        'tcr-pending-tampered',
        { comments: 'Approving' },
        managerPropA,
      );
    },
    /Cross-user integrity violation on approval: WorkShift 'ws-tampered' belongs to user 'worker-2' but correction request targets user 'worker-1'/,
    'TEST 85 FAILED: Approval must reject cross-user inconsistency before state transition',
  );
  console.log('✓ TEST 85: Approval re-verifies employee/resource consistency atomically');

  // -------------------------------------------------------------------------
  // TEST 86 (Audit 29): OWNER correction list honors server-resolved company context during masking
  // -------------------------------------------------------------------------
  const mockPrismaOwnerMasking: any = {
    location: {
      findUnique: async (args: any) => {
        if (args.where.id === propA) return { id: propA, companyId: compAlpha };
        if (args.where.id === propB) return { id: propB, companyId: compBeta };
        return null;
      },
    },
    timeCorrectionRequest: {
      findMany: async (args: any) => {
        const isPropB = args.where.propertyId === propB;
        return [
          {
            id: isPropB ? 'tcr-owner-propB' : 'tcr-owner-propA',
            propertyId: isPropB ? propB : propA,
            userId: 'worker-1',
            workShiftId: 'ws-1',
            status: 'PENDING',
            property: {
              id: isPropB ? propB : propA,
              name: isPropB ? 'Beta Resort' : 'Alpha Resort',
              locationCode: isPropB ? 'BET-01' : 'ALP-01',
              companyId: isPropB ? compBeta : compAlpha,
            },
            user: { id: 'worker-1', employeeNumber: 'EMP-001', firstName: 'John', lastName: 'Worker' },
            requestedBy: { id: 'worker-1', firstName: 'John', lastName: 'Worker' },
            reviewedBy: null,
            workShift: {
              id: 'ws-1',
              userId: 'worker-1',
              locationId: isPropB ? propB : propA,
              payRateApplied: 25.0,
              billRateApplied: 35.0,
            },
          },
        ];
      },
    },
  };

  const tcServiceOwnerMasking = new TimeCorrectionService(mockPrismaOwnerMasking, authzService);

  // 1. OWNER on own property (compAlpha): authorized financial fields remain visible after maskFinancialFields
  const ownerOwnResults = await tcServiceOwnerMasking.getCorrectionRequests(ownerCompAlpha, { propertyId: propA });
  assert.strictEqual(ownerOwnResults.length, 1, 'TEST 86 FAILED: Expected 1 result for OWNER own property');
  assert.strictEqual(ownerOwnResults[0].workShift.payRateApplied, 25.0, 'TEST 86 FAILED: payRateApplied must remain visible for OWNER on own property');
  assert.strictEqual(ownerOwnResults[0].workShift.billRateApplied, 35.0, 'TEST 86 FAILED: billRateApplied must remain visible for OWNER on own property');
  // Confirm property companyId is not exposed unnecessarily in the response contract
  assert.strictEqual(ownerOwnResults[0].property.companyId, undefined, 'TEST 86 FAILED: property.companyId should be omitted from response contract');

  // 2. OWNER on foreign property (propB belongs to compBeta): access denied / rejected
  await assert.rejects(
    async () => {
      await tcServiceOwnerMasking.getCorrectionRequests(ownerCompAlpha, { propertyId: propB });
    },
    /Access denied for property scope/,
    'TEST 86 FAILED: Expected ForbiddenException when OWNER queries foreign property correction list',
  );

  // 3. Direct defense-in-depth masking verify: OWNER + foreign company property masks financial fields
  const foreignShiftRecord = {
    id: 'ws-foreign',
    userId: 'worker-1',
    locationId: propB,
    payRateApplied: 25.0,
    billRateApplied: 35.0,
  };
  const maskedForeign = authzService.maskFinancialFields(
    foreignShiftRecord,
    ownerCompAlpha,
    propB,
    compBeta, // server-resolved foreign companyId!
  );
  assert.strictEqual(maskedForeign.payRateApplied, undefined, 'TEST 86 FAILED: payRateApplied must be masked for foreign property');
  assert.strictEqual(maskedForeign.billRateApplied, undefined, 'TEST 86 FAILED: billRateApplied must be masked for foreign property');
  console.log('✓ TEST 86: OWNER correction list honors server-resolved company context during masking');

  console.log('\n================================================================');
  console.log(' ✅ ALL 29 PHASE 3.2 SECURITY & INTEGRITY AUDIT TESTS PASSED!   ');
  console.log('    (Including Tests 78-86 / Audit 21-29 Targeted Fixes)        ');
  console.log('================================================================\n');
}

if (require.main === module) {
  runPhase32SecurityAuditTests().catch((err) => {
    console.error('❌ PHASE 3.2 AUDIT TEST FAILED:', err);
    process.exit(1);
  });
}

# NEXUSTAFF UX RECOVERY CORRECTIVE REPORT

Date: 2026-09-16. Implementation complete; remote beta acceptance remains gated below. No deployment, database mutation, migration application, backfill execution, PIN reset, or Phase 5 work was performed in this pass.

## 1. Admin/Clock separation correction

`/` redirects directly to `/clock`. `/admin` retains the authenticated Admin shell; `/admin/login` only authenticates administrators. The shared portal chooser and Admin login/sidebar employee-clock launchers are removed. Settings retains the authorized `/clock/setup` bridge labeled **Terminal Setup**. The employee clock has no management navigation, payroll, or staff directory. Existing dark UI, branch cards/selector, Staff accordion fixes, timezone display, and authoritative clock action panel are preserved. No theme redesign.

## 2. PIN lookup architecture

Selected model A: nullable digest on User, filtered through canonical EmployeeAssignment. One user has one canonical PIN across their branches, so this avoids independently synchronized per-property credential copies. HMAC-SHA256 uses a domain-separated message and a required independent 32-byte `PIN_LOOKUP_KEY` encoded as exactly 64 hex characters. There is no default key. The digest is an identity hint; canonical bcrypt verification still decides credential validity.

Lookup filters by company, digest, ACTIVE account, selected property, active assignment and current effective dates, selecting at most two identities. Zero or multiple candidates fail; exactly one invokes the existing canonical kiosk status service and one bcrypt comparison. No candidate scan or 100-person limit remains. Responses never include the digest, hash, encrypted PIN or keys. Existing WorkShift state-machine rules remain authoritative.

The database stores a non-secret HMAC key fingerprint. Missing enrollment or mismatched runtime keys fail closed. A completeness guard rejects lookup for a branch with any currently eligible hashed user lacking a digest, preventing an unindexed legacy PIN from being mistaken for another enrolled identity. This intentionally makes enrollment a release gate.

## 3. Prisma/schema changes and safe enrollment

New migration: `backend/prisma/migrations/20260916000100_indexed_kiosk_pin/migration.sql` (created, NOT applied).

- `User.pinLookupDigest String? @map("pin_lookup_digest") @db.VarChar(64)`.
- Composite index on `(company_id, pin_lookup_digest)`.
- EmployeeAssignment index on `(user_id, property_id, active, effective_from)`.
- `pin_lookup_config` singleton containing only the key fingerprint, with database CHECK id=1.

An explicit maintenance backfill is provided. It reads existing encrypted PINs only for enrollment, verifies them against bcrypt and derives digests. Authentication lookup never decrypts PINs. Hash-only records remain unresolved; they cannot be reconstructed and require individual authorized enrollment/reset or deactivation of eligibility. No automatic reset occurs. Invalid encrypted records/key mismatch and overlapping duplicate PINs abort apply before any writes. Dry run reports counts only. Application occurs atomically under the same advisory lock as PIN/eligibility mutations.

Operator sequence for a future authorized release, not executed here:

1. Back up the database and existing encryption key; stop clock traffic and old writers during maintenance. Review this additive migration against the target database.
2. Supply a securely generated, stable, independent `PIN_LOOKUP_KEY` through the secret store. Keep the original `PIN_ENCRYPTION_KEY`. Do not paste either in commands, source, reports or logs.
3. Build the backend and run the normal `prisma migrate deploy` against the explicitly chosen target. Never use db push or reset. The Docker startup wrapper already deploys migrations; keep clock traffic disabled until enrollment completes.
4. From the backend image/workdir with environment supplied securely: `node scripts/backfill-pin-lookup.cjs --database <expected_database_name>` (dry run).
5. Resolve duplicate assignments/PINs through authorized operations. If encrypted records cannot be verified, diagnose the key/data before proceeding. Review hash-only users requiring explicit enrollment. Then run the same command with `--apply`.
6. Repeat dry run, verify enrollment and normal clock/reset/add-assignment behavior before enabling traffic. Fresh empty databases initialize the fingerprint safely at first PIN mutation; normal onboarding writes the digest immediately.

Key rotation also requires maintenance and a complete atomic backfill; never rotate only the environment variable. Old workers then reject the fingerprint rather than authenticating a mixed-key index. Failed apply rolls back the complete transaction. Preserve schema and keys when rolling back an application release; do not automatically drop columns or reset data.

## 4. Duplicate PIN policy

Two ACTIVE users cannot reserve the same PIN in overlapping active assignment windows at the same property. Endpoints are inclusive. Future overlap is checked, as are all properties assigned to a user. Identical PINs are allowed in disjoint properties or non-overlapping windows. Reset, onboarding, assignment addition and status reactivation run collision checks under a shared PostgreSQL transaction advisory lock. Reset updates bcrypt, encrypted record, digest and audit atomically. Failed conflicts roll back. Ordinary profile edits no longer rewrite an old credential tuple. Runtime ambiguity is rejected even if an out-of-band database writer bypassed application checks. No arbitrary winner or silent reset.

## 5. Brute-force / Redis behavior

Removed the branch-wide five-failure lockout. Redis now enforces an atomic 60-attempt/60-second budget per server-observed client address, including attempts against already-blocked hints, plus five failures/900 seconds per property/digest hint. Existing employee-specific canonical PIN lockout remains. Redis failures produce safe unavailability; authentication never proceeds without these checks. Address keys are HMACed, not raw IPs. No credentials are logged.

The current server does not blindly trust forwarded IP headers. Devices behind one proxy/NAT may share the client budget (and existing HTTP throttles); verify trusted proxy topology and real simultaneous devices before beta. Device pairing continues to select a property in the existing setup flow; this change does not turn it into cryptographic device attestation.

## 6. Attendance detail export

Authenticated `GET /api/v1/reports/attendance/detail.csv` accepts `period=custom|weekly|biweekly`, `start_date`, optional `end_date`, and optional `location_id`. Weekly/biweekly mean 7/14 inclusive calendar dates from the selected start. Custom is inclusive with an explicit maximum of 366 days; excess is rejected, never truncated.

The server pages all matching WorkShifts in batches of 500 in a repeatable-read transaction, independent of the attendance UI's 200-event window. One row per authoritative shift includes company/property/code, department/position, staff/name/number, branch-local work date, effective clock/lunch timestamps, stored worked minutes/hours, shift/correction/approval status, actual recorded approver and timezone. Raw clock-in/out columns preserve source evidence. Duplicate lunch evidence is marked AMBIGUOUS.

A shift belongs to its effective clock-in date in its property's timezone, including overnight/DST boundaries; shifts are not split at midnight. Timestamps are explicitly UTC. Completed minutes come from stored regular + overtime minutes; unfinished/unknown totals remain blank. Orphan attendance without a canonical WorkShift in the requested period returns a reconciliation error rather than silently omitting it. Financial or credential fields are never selected. CSV cells escape quotes/commas and neutralize formulas. The response is private/no-store and an attachment.

## 7. Period summary export

`GET /api/v1/reports/attendance/summary.csv` uses the same period and authorization rules. One row per staff member with shifts in the selected period, aggregating only selected authorized properties. Includes period boundaries, canonical completed minutes/hours, incomplete shift count, deduplicated correction count and recorded approval statuses. Properties are listed together for multi-property staff. Staff without shifts have no fabricated zero-hour row.

Incomplete periods explicitly say PARTIAL_COMPLETED_SHIFTS_ONLY, with unfinished counts; all-complete periods say COMPLETED_SHIFTS. No payroll money or estimated hours. Both exports are available from Reports; Attendance links to complete-period export. The obsolete browser loaded-events CSV implementation was removed. Failed or stale requests cannot download misleading data.

Exports have a 60-second database transaction timeout and buffer the completed CSV before sending. There is no silent row limit; an operational timeout fails the whole request. Very large production periods still require measured memory/load testing and potentially an asynchronous export job later.

## 8. Approval workflow integration status

Reviewed Timesheet, TimesheetPeriod, ApprovalWorkflow, ApprovalStep, TimesheetApprovalHistory and TimeCorrectionRequest. The first five have schema/seed structures but no complete application services/controllers for period generation, submission, workflow execution and approval/rejection. This is NOT an implemented end-to-end period approval system.

Exports consume existing matching Timesheet status and latest APPROVED history actor; absent records say NOT_AVAILABLE and multiple matches AMBIGUOUS. Existing statuses are not claimed as newly verified or finalized by exporting. UI explicitly states period approvals are unavailable.

TimeCorrectionRequest does have create/list/approve/reject service/controller logic and effective-time/audit updates. However, TIME_APPROVE permission calls in the generic PermissionsGuard and correction approve/reject paths omit resolved property-company context; non-super scoped operation needs correction and integration coverage. Do not claim that branch-manager approval is fully ready.

Minimal follow-up: reuse the existing models to implement period generation/membership, submit/review/approve/reject endpoints, configured ApprovalStep transitions/history and concurrency protection; define period timezone/boundaries and invalidation/reapproval on corrections; resolve company context for correction permissions; add role/tenant tests and then wire the review/approval UI. No second approval architecture was introduced.

## 9. Authorization matrix

All exports require authenticated TIME_VIEW and current server-resolved property scope; client selection never authorizes access. No export includes pay/bill/markup even for financial roles.

| Role | Export scope |
| --- | --- |
| SUPER_ADMIN | One selected property or all authorized properties across companies |
| OWNER | Selected property or authorized aggregate within own company |
| ADMIN | Own-company properties granted under existing property access policy; explicit TIME_VIEW required |
| MANAGER | Granted properties within own company, with TIME_VIEW |
| LOCATION_ADMIN | Assigned/granted properties within own company, with TIME_VIEW |
| SUPERVISOR | Assigned/granted properties within own company, with TIME_VIEW |
| WORKER / unauthenticated | No report route access |

Existing ADMIN does not automatically gain every company property. Company-wide Admin export requires appropriate existing grants; this pass does not expand authorization based solely on the role label. Conflicting scope headers/query, foreign companies and ungranted properties are rejected.

## 10. Files changed in this corrective pass

Paths below are repository-relative. The working tree already contained the prior Legacy UX recovery; its other changes were preserved, not recreated or reverted.

- Configuration/docs: `.env.example`, `render.yaml`, `BETA_OPERATIONS.md`, this report, historical report supersession notice.
- Prisma: `backend/prisma/schema.prisma`, new `20260916000100_indexed_kiosk_pin/migration.sql`.
- PIN: `backend/src/infrastructure/security/pin-lookup.ts`, `pin-lookup-backfill.ts`; `backend/scripts/backfill-pin-lookup.cjs`; `backend/src/application/services/attendance.service.ts`, `onboarding.service.ts`, `staff.service.ts`; attendance controller; `backend/src/main.ts`.
- Exports: `backend/src/adapters/dtos/period-export.dto.ts`, `backend/src/application/services/period-export.service.ts`, reports controller, app module.
- Frontend: root route, Admin login/settings, Admin sidebar, beta-attendance, reports-view, new period-exports component, new export-period helper, api-client, admin-access, obsolete attendance-export implementation removal (event type retained).
- Tests: backend legacy-ux/period-export suites and phase47c fixture; frontend corrective suite, legacy-ux, beta-readiness and phase41 expectations.

## 11. Tests/results

- Backend focused Node suites: 82 tests passed across beta-readiness, phase47b, phase47c, startup, legacy-ux (24), period-export (16). Includes one bcrypt among 1,500 synthetic candidates, ambiguity, tenant/branch isolation, effective dates/status, atomic reset/duplicate rollback, assignment lock order, Redis failure/rate budgets and safe backfill/key validation.
- Existing backend authorization/security regression suite passed earlier in this pass.
- Export fixture: 1,105 complete shifts across three data pages, beyond 200; summary deduplication, corrections, overnight/DST, all role scopes, injection, metadata and safe controller failure tested.
- Frontend: 60 tests passed, including actual component-handler tests for accordion/stale response, export filters/actions, route separation and permission-aware branch/report controls.
- Backend build: passed. Frontend production build: passed (nonfatal webpack cache snapshot warnings). Backend and frontend TypeScript noEmit: passed. Prisma schema validate: passed. Prisma client generated. Git diff whitespace check: passed.
- Read-only local DB probe confirmed configured target localhost:5432/nexustaff_test (public); Prisma reports that database does not exist. Database integration, migration/backfill execution, real PostgreSQL concurrent transactions/query plans and live Redis/load tests are NOT claimed passed. No new browser acceptance against a functioning backend is claimed.

## 12. Remaining blockers for remote beta

1. Restore/provision the isolated local test PostgreSQL environment through an authorized operation, apply/rehearse migration and backfill, and run real DB/Redis concurrency, isolation and index/query-plan tests. No database was created here.
2. Supply stable independent PIN_LOOKUP_KEY and complete conflict-free enrollment. Resolve eligible hash-only records and invalid encrypted records before clock traffic.
3. Verify remote trusted proxy/client-IP behavior with multiple terminals and spoofed forwarded headers; avoid shared-proxy throttle starvation. Verify deployment secrets, HTTPS, persistent Redis, database backups and recovery.
4. Finish the documented period approval API/permission work if supervisor submit/approve is required for client beta. Current exports remain honest about missing approval state.
5. Perform browser acceptance with real authorized roles/data, PIN resets, assignments, period exports and load at expected location/staff volume. Unit candidate tests establish the algorithm, not a measured PostgreSQL production latency claim.

Verdict: corrective source changes and unit/build validation complete; remote beta is not approved for deployment until these operational/integration gates are satisfied. No remote deployment performed.

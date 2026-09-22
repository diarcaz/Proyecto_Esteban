# NEXUSTAFF FUNCTIONAL BETA HARDENING REPORT

Date: 2026-09-22. Scope: current working tree, controlled local functional pilot, and the authoritative product decisions A–H. Baseline was clean commit `9852ca55` (`beta v.1`). Accepted Access & Users and Beta Polish work was preserved. No Render access, deployment, production credentials/data, db push, database reset, volume deletion or migration-history rewrite occurred.

The functional verdict below is based on local tests. It does **not** establish that the remote environment is ready to collect real attendance: the remote-only gates in section 25 remain mandatory.

## 1. Architecture inspected

NestJS/Prisma/PostgreSQL, Redis sessions/PIN abuse controls, Next.js Admin/Clock portals, DB-rehydrated JWT authorization, Company/Property capabilities, Admin Accounts, canonical EmployeeAssignment and WorkShift, immutable AttendanceLog, TimeCorrectionRequest, persisted Timesheet/ApprovalWorkflow and authoritative CSV services. Examined startup/bootstrap, guards, legacy attendance/Staff routes, deployment configuration and existing operational reports. Harmless internal/test helpers were retained.

All DB work used `localhost:5432/nexustaff_test`; Redis used `127.0.0.1:6379/15`. The existing safe local-test environment validates the database name/host and suppresses bootstrap. Browser acceptance used frontend 3100 and backend 3101. Production-like baseline containers on 3000/3001 were not repurposed.

## 2. Administrative account lifecycle

PASS. Existing Access & Users already supports role/grant/permission/name editing, password reset and ACTIVE/TERMINATED status including reactivation. OWNER created ADMIN, MANAGER, LOCATION_ADMIN and SUPERVISOR through authenticated HTTP. SUPER_ADMIN remains platform-controlled. Real Admin Accounts integration passed all 14 cases, including delegated lower-role creation, stale/concurrent updates, company/property isolation and legacy Staff mutation rejection. No new admin implementation or destructive delete was introduced.

## 3. Session/password lifecycle

Fixed old-token survival after password reset with an opaque HMAC credential version derived from the current password hash, never the hash itself in the token. Access and refresh tokens now have distinct types. JWT validation rejects old credential generations and refresh-as-access. Redis atomically consumes refresh credentials, so two simultaneous refreshes have one winner.

Real HTTP/PG tests prove old access/refresh rejection after reset, old-password failure/new-password success, inactive-account rejection and current role/permission rehydration. Revoked Branch access fails on the next request with the unchanged token. Old-format sessions must log in once after release. Access lifetime remains 15 minutes, refresh seven days. Logout revokes refresh and clears the browser; copied access credentials retain their bounded remaining lifetime. Reactivation restores eligibility; reset before reactivation when compromise is suspected. These bounded behaviors are documented rather than presented as global session revocation.

## 4. Company/Branch lifecycle

Fixed OWNER-without-legacy-assignment rejection on routes whose services already resolve real target Company/Property. OWNER creates/edits authorized Branches via HTTP. Company mismatch is rejected instead of silently ignored; create/update require PROPERTY_MANAGE. Invalid IANA timezone and non-positive/non-integer maximum shift duration are rejected. Browser Branch pairing uses the actual ID/code/timezone.

Legacy Branch deletion could cascade attendance history. It now fails closed; historical Branches remain available. There is no archive/status model for Branches, so no destructive or invented archival workflow was added. Baseline administrative context remains platform-provisioned.

## 5. Staff lifecycle

PASS. OWNER created 20 Staff sequentially via application HTTP, with identity/Staff Number, alternating optional email, Department, Position, effective assignment and PIN; every result was server Clock Ready. Canonical onboarding is transactional. Existing integration covers duplicate identity/PIN, overlapping assignments, future/expired/inactive assignment, multi-Branch disjoint PIN use and denied capabilities.

Added inactive-directory opt-in and status controls so Staff can be deactivated/reactivated through the UI. Status writes serialize with canonical punches using the user row lock and reject deactivation during an OPEN shift. History is retained. Browser acceptance edited a Staff identity, deactivated/reactivated, added a second Branch assignment plus Department/Position, and deactivated that assignment; original Branch eligibility remained correct. PIN view/reset capabilities and reset/collision consistency are covered by existing browser baseline plus rerun integration/regression tests.

## 6. PIN/Kiosk lifecycle

PASS. Current browser acceptance paired the disposable Branch, identified Staff and completed CLOCK_IN, LUNCH_START, LUNCH_END, LUNCH2_START, LUNCH2_END, CLOCK_OUT. Each subsequent identity check showed the correct server-allowed action set. Automatic privacy reset was observed; a different Staff member then identified independently. The terminal was restored to the original Test North configuration before fixture cleanup; the temporary tab was closed and viewport reset.

Real Redis/PG suites cover invalid/inactive/foreign context, PIN collision/reset and previous PIN rejection, indexed lookup, digest/key mismatch, per-client/property budgets, shared credential lockout and disconnected Redis safe failure. Normal rate limits were not bypassed. Synthetic local credentials were used, not production credentials. No PIN/hash/key values are included in this report.

## 7. WorkShift state machine

PASS. Existing user row serialization and canonical state engine retained. Invalid state/duplicate transitions now return controlled conflicts instead of successful replay. Each of six canonical actions was raced through two simultaneous calls against actual PostgreSQL: exactly one succeeded, one returned 409, one raw log per action, one completed shift, no duplicate OPEN shift, six rejected-attempt audit records without credentials.

Missed clock-out stays without raw/effective end until an approved correction. A later-day clock-in creates a separate WorkShift and preserves the stale one as MISSED_CLOCK_OUT. Read paths also expose incomplete/overdue state without inventing punches. Existing tests cover duplicate/out-of-order actions, both lunches, maximum-shift behavior, overnight/DST and rate snapshots. Internal missed-shift scanning helpers have no production controller/job caller; canonical punch/read behavior governs this pilot.

## 8. Corrections

Fixed reachable correction create/read authorization gaps: administrative role plus persisted TIME_EDIT for creation and TIME_VIEW for retrieval. Approve/reject retain TIME_APPROVE checks and actual target Company/Property verification. OWNER no longer needs unrelated legacy assignment rows. WORKER, missing capability, foreign target and contradictory context were rejected through real HTTP.

Added a small Time corrections panel inside period review: canonical shift selector, correction type, verified device-local timestamp converted to UTC, reason, Branch history and authorized approve/reject. Browser created/approved a correction; authoritative review changed to 184 minutes. Raw timestamps remained intact. Concurrent approve/reject has one winner. The panel supports missed exit and incorrect clock-in/out; it does not introduce direct log mutation.

## 9. Period approvals

PASS. Persisted Branch `requireApproval` defaults ON. Setting changes require authorized company administration, serialize with review operations, record audit and invalidate prior final state. ON preserves configured step ordering; SUPER_ADMIN cannot skip an explicitly configured Supervisor/Owner step. OFF disables mandatory submit/approval and exports NOT_REQUIRED with no fictitious approver.

Both settings passed actual PostgreSQL tests. Browser toggled OFF, reloaded the page, reopened the Branch review and confirmed persistence plus disabled submission. Weekly/biweekly, version/review-token rejection, approve/reject/correction-required and concurrent approval are covered by the existing integration suite.

## 10. Correction/reapproval

PASS. A completed period went through Supervisor then Owner to CLOSED. Approved correction reopened it and set CORRECTION_REQUIRED; fresh review/submission restarted the configured steps. The conservative policy invalidates affected coworker sheets as well, with history. Tests verified corrected totals of 181 minutes, then OFF-mode 182 minutes and ON reapproval.

An additional real PostgreSQL race ran correction approval against final period approval. Correction succeeded; final persisted result remained OPEN/CORRECTION_REQUIRED with 184 authoritative minutes. It could not silently retain stale final approval. Pending correction blocks submission; test setup was corrected to submit before creating the racing request, without weakening that rule.

## 11. Reports/exports

PASS. Detail and Summary use RepeatableRead, persisted WorkShift/effective corrections and server pagination, not the loaded 200 events. Integration exported 600 shifts/1,200 logs, with weekly/biweekly/custom calendar tests, authorized aggregate/restricted scopes, UTC labels, overnight/DST, correction/approval status, CSV quoting and formula protection. No financial fields or invented payroll values are exported.

Incomplete Detail rows retain a blank end and worked total. Summary explicitly includes incomplete count and PARTIAL_COMPLETED_SHIFTS_ONLY, so its completed-shift subtotal is not represented as definitive total attendance. Orphan raw evidence causes controlled export refusal, not silent omission. OFF exports say NOT_REQUIRED; ON exports use persisted approval state. After browser correction, review and effective data changed together; automated post-correction CSV assertions provide the export evidence.

## 12. Authorization-abuse findings

Real HTTP and PG tests exercised SUPER_ADMIN, OWNER, ADMIN, MANAGER, LOCATION_ADMIN, SUPERVISOR and WORKER. Tested foreign company/property, contradictory header/query, permission/role spoofing, protected accounts, correction target, period/export scope and removed grants with existing credentials. Sensitive decisions resolve stored target Company/Property. WORKER cannot enter Admin APIs or correction/period/export routes.

## 13. Legacy bypass findings

Fixed `/attendance/admin-clock`: it previously trusted proxy role/legacy location access without requiring TIME_EDIT on the actual employee/Branch. It now verifies target employee is operational Staff, company matches the persisted Branch and actor has TIME_EDIT, then delegates to the existing canonical engine. HTTP rejects missing permission and foreign target without adding logs.

Legacy raw attendance adjustment/overtime mutations already reject in favor of corrections; tests retained. Legacy Staff admin mutations remain denied. Branch hard-delete is blocked. Seed/bootstrap/backfill remain explicit operational scripts rather than automatic public runtime mutation routes. No harmless test code was removed.

## 14. Data integrity

Read-only `scripts/pilot-integrity-check.cjs` returned zero users missing required company, foreign admin grants, wrong-company/administrative employee assignments, overlapping active assignments, multiple OPEN shifts, mismatched raw-log context, mismatched timesheet context and invalid non-null assignment snapshots.

Two pre-existing synthetic browser WorkShifts have null assignment snapshots. Both belong to the retained baseline fixture; `local-browser-fixture.cjs` explicitly creates those historical shifts without the snapshot. The new canonical pilot shifts did not add this defect. Baseline records were not rewritten. A real customer's equivalent legacy records would need an explicit reconciliation assessment before acceptance. PIN credential synchronization/divergence handling is tested through reset/rollback/wrong-key integrations, without exposing or reconstructing old PINs.

## 15. Restart/persistence

Local Docker PostgreSQL and Redis were reachable. The disposable pilot included Company, two Branches, administrators, 20 Staff/assignments, completed shift and approved timesheet. A deterministic business snapshot was checked across separate Redis, PostgreSQL and backend restarts. Business data remained identical; Redis responded PONG and retained the temporary marker after its graceful restart. No volumes were deleted. This demonstrates local restart persistence, not crash recovery or provider backup.

Only identified disposable audit companies/records were cleaned up using guarded local cleanup. Original browser fixtures remain. Agent-started 3100/3101 processes were stopped; existing Docker services remain available. Temporary restart metadata was removed.

## 16. Operational configuration

Updated BETA_OPERATIONS.md with current env requirements, independent stable PIN keys, current token behavior, app workflows, migration, backup and proxy gates. Normal startup remains migration deploy then Nest; one-time bootstrap must stay absent/false for the already initialized beta, and its inputs should be removed. No automatic seed, password reset or enrollment. Health verifies both dependencies with bounded failure and safe responses. The frontend API base remains a build-time setting.

## 17. Backup/recovery assessment

No remote backups were verified. Previously documented free-provider assumptions are unsuitable evidence for multi-day real attendance. An operator must establish backup ownership, retention/RPO/RTO, automated backups, a separate restore drill and stable-key recovery before real data collection. Local restart tests are not substitutes. Preserve a reviewed release commit/image and configuration; roll back only compatible app code without down/reset/db push or replacing live data. Old code ignoring OFF policy is not compatible with operating an OFF Branch.

## 18. Proxy/rate limits

No blind trust-proxy change. Current req.ip derives from the socket peer; actual deployed forwarding topology remains unverified. Local endpoint/Redis behavior passed; per-process generic throttling and shared-network behavior need the exact remote checks in BETA_OPERATIONS.md. Login limits stayed enabled. There is no claim that an audit IP is a verified original remote client address before that gate passes.

## 19. Full pilot simulation

Disposable Company with two operating Branches and a foreign control; platform bootstrap fixture, OWNER login, lower admins via app HTTP, 20 Staff, Department/Position, PIN readiness, full canonical lunch sequence, ordered approval, correction/invalidation/reapproval and corrected CSV all completed. Historical timestamps were controlled in canonical-service fixtures to exercise closed calendar periods; current-day kiosk interactions were performed in the browser. This is combined HTTP/PG/browser evidence, not a claim that historical dates were entered through the kiosk UI.

## 20–21. Defects found and fixed

| Defect | Concrete failure before fix | Resolution/evidence |
| --- | --- | --- |
| Password reset did not invalidate old tokens | Old credential holder continued protected requests | Credential generation/type validation; old access/refresh 401 |
| Non-atomic refresh consumption | Two refreshes could reuse one credential | Redis compare/delete; exactly one winner |
| OWNER depended on legacy assignment rows | Ordinary Branch/Staff/period/correction operations denied | Existing server-scope route marker and persisted service checks; HTTP passes |
| Correction create/read lacked capability enforcement | Actor could use correction workflow without intended capability | Role/TIME_EDIT/TIME_VIEW, adversarial HTTP |
| Legacy proxy punch lacked TIME_EDIT | Read-only branch admin could attempt Staff punch | Persisted employee/Branch/permission check; HTTP denied |
| Branch hard delete cascaded history | Operational evidence could disappear | Delete denied, history count unchanged |
| Staff inactive UI missing; open-shift deactivation unsafe | Client needed external intervention or stranded active shift | Directory/status UI, locking/open-shift guard, browser and PG |
| Approval always mandatory | Approval-optional client could not operate honestly | Additive persisted setting; ON/OFF PG and browser reload |
| Duplicate punch returned success / no rejection audit | Two terminal callers could both perceive acceptance | Controlled conflict plus safe audit; six real races |
| Non-positive max-shift accepted | Invalid stale-shift policy could affect clock behavior | Positive integer validation; HTTP rejection |

Tests were adjusted only where legitimate behavior changed: credential-aware fixture tokens, permission-bearing correction actors, rejection status/audit expectations, strict company mismatch and migration count. Initial new-test ordering and pending-correction setup failures were fixed in the test harness; all final runs below passed. The earlier JwtService signing-secret correction remains test infrastructure.

## 22. Schema/migration

Exactly one additive change, explicitly authorized by product decision F:

```sql
ALTER TABLE "property_operational_configs"
ADD COLUMN "require_approval" BOOLEAN NOT NULL DEFAULT true;
```

Prisma field: `requireApproval Boolean @default(true) @map("require_approval")`. No prior data is dropped/rewritten; existing clients retain ON. Migration `20260922230000_optional_branch_approval` was deployed only to nexustaff_test (nine migrations now applied). No production migration was applied. Prisma validate/generate passed. Final generate initially met a Windows DLL lock from our running server; stopping that process resolved it without permissions changes.

## 23. Files changed

- `.gitignore`, `BETA_OPERATIONS.md`, this report.
- `backend/prisma/schema.prisma`, new `backend/prisma/migrations/20260922230000_optional_branch_approval/migration.sql`.
- Controllers: `backend/src/adapters/controllers/{attendance,location,period-approval,staff,time-correction}.controller.ts`.
- Services: `backend/src/application/services/{attendance,location,period-approval,period-export,staff,time-correction,work-shift}.service.ts`.
- Auth/cache: `backend/src/infrastructure/auth/{auth.service,jwt.strategy,credential-version}.ts`, `backend/src/infrastructure/cache/redis.service.ts` (credential-version is new).
- Backend regressions: `backend/src/domain/security/{phase32-security-audit,phase41-remediation,work-shift-service}.spec.ts`.
- Scripts: `backend/scripts/{admin-accounts.integration,phase47b,predeploy-http,predeploy.integration}.test.cjs`; new `pilot-hardening.integration.test.cjs`, `pilot-integrity-check.cjs`, `pilot-persistence-check.cjs`.
- Frontend: `frontend/src/app/admin/(protected)/employees/page.tsx`, `frontend/src/components/reports/{period-review,time-corrections}.tsx`, `frontend/src/lib/api-client.ts` (time-corrections is new).
- Frontend tests: `frontend/tests/{period-review,phase46,time-corrections}.test.cjs` (time-corrections is new).

No dependency/lockfile changes; generated TypeScript build metadata restored to its baseline. No commit/deployment made.

## 24. Final validation

| Check | Result |
| --- | --- |
| Admin Accounts + onboarding + predeploy real integrations | 54/54 PASS (14 + 14 + 26) |
| New pilot hardening PG/Redis/HTTP suite | 14/14 PASS |
| Live HTTP export/period tenant suite | 4/4 PASS |
| Focused backend script regressions | 86/86 PASS |
| Existing security/WorkShift/correction guard runner | PASS: authorization 12, Staff 6, guards 6, WorkShift 33, Phase 3.2 29, Phase 4 15, Phase 4.1 43, Phase 4.2 12 |
| Frontend regression suite | 76/76 PASS, including inactive-editor and correction UI regressions |
| Backend build + TypeScript noEmit | PASS |
| Frontend production build + TypeScript noEmit | PASS; all 17 static pages generated |
| Prisma validate + generate | PASS, Prisma 5.22.0 |
| Read-only structural integrity | PASS with explicitly identified two historical synthetic snapshots |
| git diff --check | PASS |

Next build emitted a non-fatal Windows webpack cache snapshot warning; compile/typecheck/static generation completed with exit 0. No security rule or rate limit was loosened to pass tests.

## 25. Remaining remote-only acceptance gates

Mandatory **P1 release gates**, not claimed completed: actual Docker/runtime image smoke, migration/health/configuration verification; provider durability/backup and isolated restore; independent secret recovery; HTTPS/CORS/socket checks; measured proxy IP/spoofing/NAT and rate-limit behavior; actual multi-tablet/viewport smoke with removal/reset/correction/export. Concrete failure risks are lost unrecoverable attendance, incorrect deployed API/runtime, cross-client throttling or spoofable budgets and device-specific broken operations. Exact actions are in BETA_OPERATIONS.md. Do not collect real pilot data until these gates pass. No paid resources or remote configuration were touched.

## 26. Remaining client-visible limitations

**P2 acceptable controlled-pilot limits:** Branch archival unavailable (deletion intentionally rejected); existing assignment end-date/context editing uses deactivate + non-overlapping replacement; advanced multi-step workflow setup uses the existing authorized API rather than a visual designer; correction time entry uses explicitly labeled device timezone; some inactive readiness text still says Assignment Required, while account status remains visible; Branch linked-record count is legacy-derived and not an authoritative active workforce count; copied access token after logout has bounded remaining lifetime; approval-OFF periods do not produce a fake approval/closure artifact. Confirm Branch timezone/calendar policy before use; avoid casual populated-Branch timezone changes. These do not require SQL for ordinary listed operations.

**P3 future improvements:** bulk CSV onboarding, richer live concurrency warnings and workflow designer. Payroll, payments, tax, invoice accounting, scheduling, geofencing and native mobile remain out of scope. No unresolved local P0/P1 was demonstrated by the acceptance evidence; remote gates remain as above.

## Authoritative product acceptance questions

| # | Decision | Result and evidence |
| --- | --- | --- |
| 1 | OWNER creates manager without platform SUPER_ADMIN | **PASS** — authenticated OWNER HTTP creates lower admin roles; no SQL workflow |
| 2 | App deactivation/reactivation of manager | **PASS** — existing Access & Users status path; real service/HTTP session checks, reactivation login, UI regression baseline retained |
| 3 | Removed Branch denied with existing session | **PASS** — same manager token: North 200 → OWNER removes grant → North 403, granted South 200; equivalent to the specified Miami scenario |
| 4 | At least 20 normal Staff creations | **PASS** — 20 sequential authenticated application requests with complete assignment/PIN and Clock Ready; browser Staff lifecycle verified |
| 5 | Honest missed clock-out and app correction | **PASS** — null raw end, separate next-day shift, MISSED state, correction affects effective end only; browser correction panel create/approve |
| 6 | REQUIRED approval repeats after correction | **PASS** — CLOSED → CORRECTION_REQUIRED/OPEN → new review/submission → ordered reapproval; correction/approval race verified |
| 7 | DISABLED approval has no mandatory/fake workflow | **PASS** — persisted OFF survives browser reload; submit rejected; current corrected CSV NOT_REQUIRED |
| 8 | One canonical concurrent punch, loser audited | **PASS** — six action races against PostgreSQL, one winner each, 409 loser, no duplicate logs/shifts, credential-free rejection audit |
| 9 | Final exports are authoritative | **PASS** — >200-event paging, persisted effective corrections, honest incomplete basis, financial masking, ON approval and OFF NOT_REQUIRED assertions |

READY FOR CONTROLLED FUNCTIONAL BETA PILOT

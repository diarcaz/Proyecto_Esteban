# NEXUSTAFF FINAL AUDIT REMEDIATION REPORT

## Baseline and scope

Baseline: `672b7037a7906a371426fd490a3151ed1e10a12a` (`harden staff onboarding and assignment UX`). The working tree was clean before this pass. Findings were checked against source before editing. This report covers the three requested findings, not a new unrestricted security audit.

Only local PostgreSQL `nexustaff_test` at localhost:5432/public and local Redis (isolated test configuration, database 15) were used. Both were reachable. No remote data, push, deployment, bootstrap, secret rotation, reset or db push was used. No historical migration was edited.

## Finding 1: confirmed YES

Normal login called failed-attempt Redis methods with their fail-open default. Bcrypt was still required, but a Redis outage could remove lockout enforcement.

`AuthService.login` now uses the existing `strict=true` Redis operations for counter reads, increments (including unknown accounts), and successful-login counter reset. A small wrapper maps lockout errors to a generic `ServiceUnavailableException` / HTTP 503: `Login temporarily unavailable. Please try later.` No Redis internals or credentials are returned. Failure prevents token issuance; read failure also prevents the account lookup and password verification.

Bcrypt, five-failure threshold, 900-second lockout, roles, token format and refresh/session logic are unchanged. Redis failure intentionally makes new login unavailable rather than disabling brute-force protection. Reset is strict as well, so a reset failure cannot proceed to token issuance.

## Finding 2: confirmed YES

Both reported relations used Cascade in Prisma and the actual local PostgreSQL constraints. A third path, `requestedBy`, also used Cascade. The user explicitly authorized protecting it in this pass.

New migration: `backend/prisma/migrations/20260924000100_restrict_correction_history/migration.sql`.

| Constraint | Reference | Before | After |
| --- | --- | --- | --- |
| time_correction_requests_user_id_fkey | users(id), user_id | DELETE CASCADE | DELETE RESTRICT |
| time_correction_requests_property_id_fkey | locations(id), property_id | DELETE CASCADE | DELETE RESTRICT |
| time_correction_requests_requested_by_id_fkey | users(id), requested_by_id | DELETE CASCADE | DELETE RESTRICT |

Names were inspected in PostgreSQL before generating the migration. Prisma's baseline-schema-to-edited-schema diff contained exactly the three constraint replacements. The SQL is enclosed in BEGIN/COMMIT so there is no committed interval without constraints. ON UPDATE CASCADE is unchanged. Optional reviewedBy, attendanceLog and workShift SET NULL relations are unchanged. No columns, records, indexes or defaults are changed by this migration.

Applied successfully ONLY to the isolated local test database using `prisma migrate deploy`. All ten repository migrations are recorded as applied. Physical constraint inspection confirms all three delete actions are RESTRICT.

Real PostgreSQL tests reject hard deletion of a referenced worker, Branch and distinct requester with P2003; the complete correction record remains unchanged after each rejected deletion. Normal Staff soft termination and Branch update succeed. Existing integration cases also pass correction creation, retrieval, approval, rejection, period invalidation and resubmission. No hard-delete feature was introduced.

## Finding 3: investigation and decision

All three controllers have TenantGuard and administrative role metadata; services resolve canonical database targets and apply fine-grained authorization. The existing authentication path rehydrates current database roles/status/scopes. No PermissionsGuard was added.

The current guard returns true when permission metadata is absent. `RequirePermissions` expresses an AND list, not OR. With SERVER_PROPERTY_SCOPE it provides only a preliminary capability check somewhere in the actor's scopes, not authorization for the actual target. Its TIME_APPROVE branch requires APPROVAL_TARGET=correction and resolves a TimeCorrectionRequest by params.id; it cannot authorize periods or timesheets. Existing correction approval routes correctly use that special metadata. Existing guarded Staff PIN routes use preliminary capability checks followed by service target checks.

### AdminAccountsController

A. Service authorization is complete for the inspected routes: current actor reload, active administrative role, company and Branch scope, strict lower-role hierarchy, permissions delegation ceiling, self/platform/operational-account restrictions and stale version checks precede account changes. List responses filter targets and mask permissions.

B. Input validation, transaction/advisory locking and internal target reads can occur before fine-grained target authorization. Account writes, password hashing for reset and returned account data follow the relevant checks. No sensitive mutation bypass was found.

C. A blanket guard is ineffective without metadata. A preliminary single-capability guard would duplicate a subset of service checks and cannot enforce all old/new Branch grants or delegation. It is not a replacement for the dynamic checks and was not added.

D. Route requirements are:

| Route | Required semantics, beyond administrative authentication |
| --- | --- |
| GET catalog | MANAGERS_VIEW OR MANAGERS_CREATE OR MANAGERS_EDIT, with company/Branch filtering and OWNER/SUPER_ADMIN rules |
| GET list | MANAGERS_VIEW for each visible target, hierarchy and company/Branch scope |
| POST create | MANAGERS_CREATE for every proposed Branch, role hierarchy and delegation ceiling |
| PATCH :id | MANAGERS_EDIT for existing target and proposed grants, role/delegation checks, version |
| POST :id/password | MANAGERS_EDIT on canonical target plus OWNER/SUPER_ADMIN-only reset rules, hierarchy, self/platform exclusions and version |

No exact static metadata set can encode the full catalog OR or multi-Branch old/new-target rules using this guard. SERVER_PROPERTY_SCOPE plus one permission would only be a redundant early filter.

E. Leaving the controller unchanged preserves valid OWNER/SUPER_ADMIN and delegated Branch administration. An AND list on catalog could reject a legitimate create-only or view-only administrator. Regression tests cover all seven roles and manipulated scope/role requests.

### OnboardingController

A. Service checks enforce canonical Branch/company scope, per-operation permissions, employee access, assignment relationships and WORKER-only operational assignments. Detail responses filter assignments and readiness by authorized Branches.

B. Creation performs validation and bcrypt/encryption before target authorization. Assignment operations may lock the PIN index/employee and read target records first. PIN-index initialization can occur inside the transaction before the permission check; rejection rolls back that initialization. No unauthorized committed Staff/assignment mutation or sensitive returned data was found. This ordering has some preauthorization CPU/lock cost, but is not evidence of an authorization bypass.

C. Single-operation preliminary checks could duplicate capabilities but cannot replace canonical target checks. Catalog OR semantics and employee-to-multiple-Branch resolution require the service. No guard change was warranted by the tested behavior.

D. Exact route semantics:

| Route | Required permission semantics |
| --- | --- |
| GET properties/:id/catalog | STAFF_VIEW OR STAFF_CREATE OR STAFF_EDIT OR PROPERTY_MANAGE on canonical Branch |
| POST properties/:id/departments | PROPERTY_MANAGE on Branch |
| POST properties/:id/positions | PROPERTY_MANAGE on Branch, Department relationship validation |
| POST employees | STAFF_CREATE on body.propertyId, company and assignment context validation |
| GET employees/:id | Employee access and STAFF_VIEW on visible Branches, existing company fallback |
| POST employees/:id/assignments | Employee access and STAFF_EDIT on proposed Branch, company/role/relationship constraints |
| PATCH employees/:id/assignments/:assignmentId/deactivate | Employee access and STAFF_EDIT on stored assignment Branch, matching employee and open-shift rules |

Simple routes could declare their single permission with SERVER_PROPERTY_SCOPE, but that would only test possession somewhere. The guard cannot express the full OR or employee/assignment target semantics through current metadata.

E. No authorization changes. A catalog AND list would incorrectly narrow legitimate access. Current tests retain OWNER self-service, 20 sequential Staff creations and Branch restrictions.

### PeriodApprovalController

A. Service checks resolve Branch/company from the actual period or timesheet, enforce TIME_VIEW/TIME_APPROVE/PROPERTY_MANAGE and retain ordered approver role/user, state and version rules.

B. Transaction locks and internal period/timesheet lookup may precede target authorization. Source/report disclosure and workflow changes follow checks. No sensitive mutation bypass was found.

C. Adding TIME_APPROVE to this guard would invoke its correction-specific resolver and reject legitimate period operations. Inventing a new guard architecture is outside this limited pass. Preliminary view/configuration checks would be redundant and still require the service.

D. Exact route semantics:

| Route | Required permission semantics |
| --- | --- |
| GET policy/:locationId | PROPERTY_MANAGE on canonical Branch |
| POST policy/:locationId | PROPERTY_MANAGE plus existing SUPER_ADMIN/OWNER/ADMIN configuration restriction |
| POST workflow/:locationId | PROPERTY_MANAGE plus existing configuration role restriction |
| GET list | TIME_VIEW on query.location_id |
| POST resolve | TIME_VIEW on body.locationId |
| GET :id | TIME_VIEW on persisted period Branch |
| POST :id/submit | TIME_APPROVE on persisted period Branch, current review/state rules |
| POST timesheets/:id/transition | TIME_APPROVE on timesheet's persisted period Branch, configured approver and state/version rules |

There is no supported APPROVAL_TARGET metadata for period/timesheet targets. Using APPROVAL_TARGET=correction would resolve the wrong entity. No misleading decorator was added.

E. Service behavior is unchanged. OWNER/SUPER_ADMIN and authorized Branch approvers retain their valid flows. Real PostgreSQL regressions pass ordered approvals, rejection, correction-required transitions, correction invalidation/reapproval and concurrent approval.

## Validation results

| Validation | Result |
| --- | --- |
| audit-login.test.cjs | 7/7 PASS: success, counter/threshold/duration, read/increment/reset failure, unknown-account failure, malformed counter |
| audit-retention.integration.test.cjs | 5/5 PASS against PostgreSQL |
| admin-accounts.integration.test.cjs | 14/14 PASS |
| phase46-onboarding.test.cjs | 17/17 PASS |
| pilot-hardening.integration.test.cjs | 14/14 PASS: sessions/refresh, OWNER flows, scope revocation, concurrency, corrections, reports and HTTP authorization |
| predeploy.integration.test.cjs | 26/26 PASS after updating obsolete migration-count assertion |
| Staff security regression runner | 6/6 PASS |
| WorkShift security/integrity regression runner | 33/33 PASS |
| admin-accounts.test.cjs | 5/5 PASS |
| Backend TypeScript noEmit and production build | PASS |
| Frontend TypeScript noEmit and production build | PASS |
| Prisma validate | PASS |
| git diff --check | PASS |

The initial combined integration run was 70/71: its only failure expected nine applied migrations instead of ten. The assertion now compares the complete applied migration-name set against repository migration directories and explicitly checks the new retention migration. The affected 26-case suite and both new suites were rerun together: 38/38 PASS. Other passing suites were not needlessly repeated after this test-only adjustment.

Two existing integration cleanup routines now explicitly delete only their disposable companies' correction fixtures before deleting fixture users. This accommodates RESTRICT without weakening production constraints or assertions. Fixture cleanup completed. No business source changed after successful builds. Frontend generated tsbuildinfo was restored to baseline. The frontend build emitted a non-fatal webpack cache snapshot warning and completed successfully.

## Files changed

- backend/src/infrastructure/auth/auth.service.ts
- backend/prisma/schema.prisma
- backend/prisma/migrations/20260924000100_restrict_correction_history/migration.sql (new)
- backend/scripts/audit-login.test.cjs (new)
- backend/scripts/audit-retention.integration.test.cjs (new)
- backend/scripts/predeploy.integration.test.cjs (fixture cleanup and migration assertion)
- backend/scripts/pilot-hardening.integration.test.cjs (fixture cleanup only)
- FINAL_AUDIT_REMEDIATION_REPORT.md (new)

## Remaining risks and remote verification

Remaining P0 from these findings: none identified. Remaining P1 from these findings: none identified. This is readiness to commit the limited remediation, not a claim that remote deployment has been verified or that all unrelated security risks have been audited.

A read-only actual-database-to-Prisma diff found pre-existing local drift: legacy users.pin_code and users_pin_code_key remain physically present but are absent from the current Prisma schema. After the new migration, those are still the only differences reported. The generated drop-column/drop-index SQL was NOT applied or included in the migration. No stored PIN values were read. This unrelated legacy storage requires a separate targeted retention/security review; whether it exists or contains data remotely was not checked. Do not apply an unrestricted schema diff as part of this remediation.

Before any separately authorized remote rollout, verify the target database's migration history and the three FK names, review backups and migration lock timing, then apply only the reviewed forward migration. FK replacement validates existing rows and holds table locks within its transaction; schedule appropriately for the actual table size and workload. Verify the three remote delete actions afterward using metadata. Check normal login and controlled Redis-failure 503 behavior in an isolated remote verification environment. Redis availability is now intentionally a prerequisite for new logins. No remote service was accessed or changed here.

RESTRICT protects these parent-deletion paths; it does not create universal tamper-proof retention or prevent an explicitly authorized direct deletion of a correction itself. No such production deletion path was added. Historical migrations and existing accepted UI/role architecture remain unchanged.

READY TO COMMIT FINAL AUDIT REMEDIATION

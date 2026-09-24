# NEXUSTAFF STAFF & ASSIGNMENT UX HARDENING REPORT

Date: 2026-09-23. Baseline: `62220b5f` (`beta v2.1`). Working tree was clean before this pass. Previously accepted Admin theme, approval policy, report buttons, Access & Users/password presets and all unrelated modules were preserved.

## Reproduction plan and findings

Before editing, inspected Staff Directory, OnboardingService/controller/DTOs, EmployeeAssignment resolver, canonical PIN identification, PIN collision rules and existing tests. Planned reproductions: reopen a form on the same Branch; switch from onboarding to Add Assignment on that Branch; switch Branch/Department; load empty and populated catalogs with and without PROPERTY_MANAGE; create current/future assignments; inspect expired/inactive/no-assignment/PIN/account states; compare correct/incorrect PIN eligibility; repeat under a scoped LOCATION_ADMIN.

**Confirmed catalog defect:** `open()` cleared the catalog even when `assignment.propertyId` stayed unchanged. Catalog loading depended only on propertyId, catalogVersion and token. Reopening the same form or switching to Additional Assignment could therefore leave a cleared catalog with no reload. The fix increments the catalog load generation on every open and includes form mode in effect dependencies. Regression tests exercise both paths and stale-response rejection.

**Onboarding diagnosis:** the same defect affects reopening Add Staff on the same Branch. Separately, a genuinely empty catalog previously looked like unusable selectors without an explanation, and inline creation refreshed without selecting the created item. These are confirmed source/local reproduction findings, not a claim to have inspected the remotely observed customer's database. An empty remote Branch or missing PROPERTY_MANAGE may independently explain the initial remote observation; no remote data was accessed.

**Other confirmed UX defects:** raw UTC dates, persisted active flag presented as eligibility, browser-local effective-date input, no explicit immediate mode, generic Assignment Required, and unrestricted rendering of thrown action messages. The Additional Assignment form used the same catalog state and was not a separate backend assignment path.

## Fixes

- Reload catalogs every time create/assignment opens; clear catalog and stale Department/Position when Branch changes; clear Position on Department change. Ignore obsolete effect responses. A failed load offers Retry catalog.
- Empty Branch/Department states explain what is missing. Existing inline controls remain behind server `canManage`; no alternate workflow or fake catalog records were added.
- Inline Department/Position uses existing authorized endpoints, then reads the authoritative catalog and selects the returned item. In-flight duplicate submissions are guarded, buttons are disabled, success feedback is shown, and obsolete Branch context responses are ignored.
- Added concise Additional work assignment explanation: same Staff account, another Branch/context or future period.
- Default Effective immediately sends the current UTC instant at submission. Schedule for later and optional end dates interpret input using persisted Branch IANA timezone from the authorized catalog. DST nonexistent/repeated wall times are rejected rather than silently shifted. No existing assignment is rewritten.
- Assignment table shows readable Branch-local dates, timezone and original UTC in the cell title. Presentation badges are Current, Scheduled, Expired, Inactive. Inactive takes precedence, then expired, then future/current. Boundary rules remain inclusive for start/end. Deactivate is shown only for Current/Scheduled rows with permission; historical rows remain intact. The form's persisted flag is labeled Assignment enabled.
- Admin readiness remains server-authoritative: existing canonical resolver determines readiness. Response now includes safe reasons for inactive Staff, missing PIN enrollment, scheduled assignment/start time, expired/inactive/missing assignment and unavailable/ambiguous context. Frontend does not turn its date badge into authorization. Successful PIN reset reloads details/readiness.
- Staff Number accepts a suffix or canonical EMP- value and visibly previews the exact canonical value to be saved. Existing backend regex is unchanged. Frontend validates the same suffix limits; HTML pattern escapes the hyphen for modern browser pattern semantics. Invalid input gets persistent inline guidance and safe native validation text. `010101` visibly becomes `EMP-010101`.
- Action errors use a reviewed safe-message allowlist and generic fallback; raw DTO/regex/Prisma/stack details are never rendered by this form. Known conflicts and assignment restrictions remain useful. Identity edit already used a generic safe error and retains it.
- Persistent helpers cover Staff Number, six-digit PIN, Department, Position and effective dates. Success banners cover Staff creation, Department/Position creation, assignment addition/deactivation and PIN reset. Form controls use wider tablet layouts after visual review.

## Authorization and security

**Backend security rules changed: NO.** Only authorized catalog/detail response metadata was extended. Existing PROPERTY_MANAGE for catalog creation, STAFF_CREATE/STAFF_EDIT/STAFF_VIEW, PIN permissions, role/company/Branch checks, overlap serialization, ambiguity handling, current-date eligibility and open-shift deactivation protection are unchanged. No permissions were secretly granted to real accounts. The disposable test administrator was explicitly seeded with test capabilities for acceptance; negative tests separately used a LOCATION_ADMIN without PROPERTY_MANAGE.

Department currently has no persisted active flag in this model; catalog returns Branch Departments and active Positions. No new activation model was invented. Positions remain filtered by selected Department and canonically validated server-side.

**Schema/migrations changed: NO.** No migration, db push or database reset. No changes to WorkShift, attendance evidence, correction/approval/export logic, bcrypt, PIN lookup/encryption/key rules, Redis abuse controls or role hierarchy.

### Clock scheduled-message decision

Clock remains unchanged and generic. The public PIN-only identification pipeline first narrows indexed candidates to current assignments, then uses canonical bcrypt/account/assignment checks. Existing policy permits PIN reuse across disjoint Branches or non-overlapping assignment windows. A future candidate is therefore not automatically a uniquely authenticated identity in this flow. Extending the search merely to reveal a start time would change identity/ambiguity and privacy behavior. This pass takes the explicitly allowed safe fallback: no future-start disclosure at Clock; detailed scheduled reason is available only in authorized Admin.

Real PostgreSQL/Redis tests verify future PIN-only attempts and unknown/wrong attempts remain generic, explicit correct future credentials still cannot punch, and no AttendanceLog is created. Current Staff still pass identification and canonical punch transitions. No financial, Department/Position or internal ID detail was added to a failed Clock response.

## Validation results

| Validation | Result |
| --- | --- |
| New focused frontend Staff UX tests | 8/8 PASS |
| Full frontend regression suite | 98/98 PASS |
| PostgreSQL onboarding/assignment integration suite | 17/17 PASS |
| Staff service security tests | 6/6 PASS |
| WorkShift security/integrity tests | 33/33 PASS |
| Frontend TypeScript noEmit | PASS |
| Backend TypeScript noEmit | PASS |
| Frontend production build | PASS, 17 static pages generated |
| Backend production build | PASS |
| Prisma validate | PASS |
| git diff --check | PASS |

Commands: frontend `node --test tests/*.test.cjs`, TypeScript `tsc --noEmit`, `npm run build`; backend `node scripts/local-test-env.cjs --test scripts/phase46-onboarding.test.cjs`, existing exported Staff/WorkShift security runners under ts-node, TypeScript/build, and Prisma validate under the safe local test environment.

Integration tests used only localhost `nexustaff_test`. The added indexed PIN test uses real Redis database 15, verifies ping, and leaves normal expiry/abuse behavior intact. Other inherited onboarding cases use the existing Redis test stub while exercising actual PostgreSQL. Both local services were healthy. Docker needed an outside-sandbox read to locate its installed executable; no remote service was involved.

Coverage includes scoped catalogs/create/PIN permissions, foreign Branch denial, no duplicate User, rollback, date/relationship validation, overlap/concurrency and ambiguity, current full lunch sequence, future/inactive/expired/no-assignment/PIN/account readiness, and safe wrong/unknown/future Clock failures. New UI tests cover reopen bug, empty states, inline reload/select, immediate/current timestamp, future timezone conversion, DST boundaries, safe errors, late response rejection and duplicate-submit guard.

Initial test-infrastructure failures were corrected (Redis service import/initialization and StaffService test call signature); no product security behavior was changed to satisfy them. Builds emitted non-fatal webpack cache snapshot and npm allow-scripts warnings; compilation and type checks succeeded.

## Browser acceptance

Fresh disposable synthetic company, two authorized Branches and one unauthorized Branch; dedicated LOCATION_ADMIN. Backend localhost:3101 and frontend localhost:3100 used the current working tree and isolated test DB.

| Scenario | Evidence/result |
| --- | --- |
| A: existing Department/Position, immediate Staff | Created through UI, server Clock Ready, Current badge, PIN recognized, actual Clock In confirmed and persisted. PASS |
| B: future Staff | Created through UI for Oct 24, 2026 at 2 PM New York; UTC stored as 18:00; Scheduled badge and explicit admin Not Clock Ready/start reason. Clock generic rejection; zero punches. PASS |
| C: empty Branch | LOCATION_ADMIN saw named empty state, created Housekeeping Department and Housekeeper Position through inline controls; each automatically selected after reload; Staff saved and Clock Ready. PASS |
| D: additional assignment | Existing Staff selected second authorized Branch and its new Department/Position, saved, and displayed two Current/Clock Ready contexts. DB verified one User with two assignments, not duplicate accounts. PASS |
| E: foreign Branch | Not listed in Branch/assignment/terminal selectors. Real authenticated HTTP request to foreign catalog returned 403; integration tests cover foreign catalog writes, Staff/additional assignment and PIN denials. PASS |

Light and dark forms checked locally; desktop, 820px tablet and 390px mobile inspected. Visible focus and readable helpers/disabled controls verified. Document scroll width matched viewport width at 390/820; tables retain internal scrolling. Tablet form changed from cramped three columns to a wider layout and rechecked. Staff number preview `010101` -> `EMP-010101` and valid browser pattern were verified without saving an extra user.

Browser session signed out; temporary tab closed; viewport restored. This pass's disposable company/users/assignments/punch records were cleaned by exact fixture company ID after checking the test database and fixture name. Existing local fixtures were preserved. No database reset. Temporary local dev processes stopped. Localhost terminal pairing in that browser points to the now-deleted synthetic Branch and needs re-pairing before another local Clock session; no remote terminal was touched.

## Files changed

- `backend/src/application/services/onboarding.service.ts`
- `backend/scripts/phase46-onboarding.test.cjs`
- `frontend/src/app/admin/(protected)/employees/page.tsx`
- `frontend/src/lib/staff-ux.ts` (new)
- `frontend/tests/staff-ux.test.cjs` (new)
- `frontend/tests/phase46.test.cjs` (readiness copy expectation)
- `STAFF_ASSIGNMENT_UX_HARDENING_REPORT.md` (this report)

## Acceptance answers

A. **PASS, with existing permissions:** authorized LOCATION_ADMIN can onboard from an empty Branch entirely in the application when STAFF_CREATE and PROPERTY_MANAGE are present. Without PROPERTY_MANAGE, they can use readable existing catalogs but cannot create catalog entries; guidance explains the dependency.

B. **PASS:** additional UI assignment persisted on the same User, with correct second Branch/Department/Position.

C. **PASS:** future assignment displays Scheduled; persisted active flag is unchanged.

D. **PASS:** server readiness reasons explain current/PIN/account/assignment conditions. Ambiguous or unavailable contexts are reported honestly rather than invented as ready. Details are snapshots and should be refreshed after time elapses or external changes.

E. **PASS:** Effective immediately uses save-time current instant; browser-created Staff identified and clocked in immediately.

F. **PASS:** incorrect/unknown PIN remains generic and non-enumerating.

G. **PASS:** future assignment remains blocked; Clock-specific start detail intentionally deferred for identity/privacy reasons allowed by the request. Admin scheduled explanation is implemented.

H. **PASS:** Staff form errors sanitize technical validation; Staff Number has inline format guidance and canonical preview.

## Remaining limitations / release assessment

- The exact remote customer's original empty-catalog cause cannot be determined without remote data; this pass fixes the reproducible source defect and missing empty/permission guidance without accessing remote systems.
- Readiness is a server snapshot, not a live countdown. Refresh/reopen details after time boundaries or external changes. Canonical Clock checks every request.
- Ambiguous/nonexistent DST wall times require another unambiguous time; no hidden offset guessing.
- Clock future-start disclosure is intentionally not added. No authorization/PIN eligibility weakening is needed for this UX release.
- No known blocker found within this pass. This is local acceptance, not remote deployment verification.

No commit, push, deployment, Render access, customer-data mutation or out-of-scope module work was performed.

READY TO COMMIT STAFF UX HARDENING

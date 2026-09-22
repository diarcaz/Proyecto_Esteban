# NEXUSTAFF BETA ACCESS MANAGEMENT REPORT

Date: 2026-09-22. Local implementation only; no deployment or Render changes.

## 1. Existing architecture

Administrative identities use the existing User model, companyId, role, status and bcrypt passwordHash. AuthorizationService resolves company ownership and property permissions. JWT validation reloads the user, status and grants from PostgreSQL on each authenticated request. Administrative scope is the union of UserLocationAssignment and UserPropertyAccess; operational EmployeeAssignment is a separate model.

## 2. Administrative-account flow

Added `/api/v1/admin-accounts`: GET catalog/list, POST create, PATCH account and POST account/password. The service re-reads the acting account from the database rather than trusting submitted role/company claims. Names, role, status and branch permissions are editable; email and company are immutable after creation. Deactivation uses TERMINATED. No destructive account deletion is exposed.

Writes, assignments and audit records share a transaction. An advisory transaction lock serializes this module's writes; an updatedAt version rejects stale edits and password resets. This lock does not serialize unrelated legacy writers. Accounts with operational EmployeeAssignment records are read-only for profile/access editing, avoiding silent changes to operational employment.

## 3. UI

Added Access & Users in the existing Admin sidebar at `/admin/access`. It lists name, email, role, company, branch grants, status and effective permissions. Forms support account creation, editing and authorized temporary-password setting. Company, property, role and permission options come from the server's delegation catalog. Password inputs clear on submission/cancel/account-context changes. Last login is omitted because no authoritative field exists. Visible Staff terminology is retained.

## 4. Roles supported

Creation supports OWNER, ADMIN, MANAGER, LOCATION_ADMIN and SUPERVISOR. WORKER stays in Staff onboarding and cannot enter this module. SUPER_ADMIN is visible to the platform administrator but cannot be created, edited, reset or deactivated here; self-mutation is also denied. This conservatively protects the platform administrator without introducing another role.

## 5. Property model

UserPropertyAccess stores each selected property's explicit permissions. UserLocationAssignment mirrors membership for existing consumers of administrative branch assignments. Both are updated atomically; no EmployeeAssignment is created. OWNER retains the existing implicit full access within its own company. No schema or migration changes were needed.

## 6. Delegation rules

- SUPER_ADMIN can create every supported administrative role across companies.
- OWNER can manage strictly lower roles within its company; only SUPER_ADMIN creates another OWNER.
- ADMIN, MANAGER and LOCATION_ADMIN require explicit MANAGERS permissions at every affected property, and may delegate only lower roles and permissions they themselves possess.
- Existing target grants must all fall inside the actor's authority before editing; replacing the request payload cannot conceal an old unauthorized grant.
- SUPERVISOR has no lower administrative role available under this conservative hierarchy. Even explicit MANAGERS permissions do not permit peer-role editing.
- Foreign companies/properties, same-or-higher roles, self-escalation and unknown permissions are rejected by the server.
- Legacy global permissions are displayed. When an authorized operator saves an account, the form converts them into explicit per-property grants and clears the old global array.

Catalog/list checks intentionally do not expose peers or higher-role accounts to delegated administrators. Creating permission without viewing permission can create a lower-role account but does not grant visibility of it afterward.

## 7. Passwords and sessions

Uses bcrypt cost 12, compatible with canonical login and bootstrap. Passwords require at least 16 characters, upper/lowercase, number and symbol, reject common patterns and cannot exceed bcrypt's 72 UTF-8 bytes. Passwords are neither returned nor written to audit logs or browser storage. Unexpected controller errors return a generic response instead of database/credential details.

Only SUPER_ADMIN/OWNER can set another permitted administrative account's password. Old passwords are replaced, never recovered. There is no forced-first-login-password-change feature. Password reset does not revoke existing access/refresh tokens; the UI states this explicitly. Account deactivation is enforced by subsequent JWT validation, and role/grant changes are read from the database on subsequent requests. Browser navigation can retain the previous login snapshot until authentication state is refreshed; server checks remain authoritative.

## 8. Audit

Transactional events: ADMIN_ACCOUNT_CREATED, ADMIN_ACCOUNT_UPDATED, ADMIN_ROLE_CHANGED, ADMIN_STATUS_CHANGED, ADMIN_PROPERTY_GRANTS_CHANGED and ADMIN_PASSWORD_RESET. Records contain actor, target and relevant role/status/grant metadata, never plaintext passwords, password hashes or PIN material.

## 9. Related cleanup

Demo seed now links its SUPER_ADMIN to the seeded company. The seed was not executed; production bootstrap behavior is unchanged. OnboardingController gains the existing administrative-role gate and retains authoritative service checks. PeriodApprovalController already had compatible role/tenant/service authorization and was left unchanged. The new controller declares server-resolved property scope so a company OWNER without legacy branch assignments can enter. Old Staff create/update/delete paths reject administrative-account mutations, closing a bypass around the new delegation checks.

## 10. Files changed

- backend/src/application/services/admin-accounts.service.ts
- backend/src/adapters/controllers/admin-accounts.controller.ts
- backend/src/app.module.ts
- backend/src/application/services/staff.service.ts
- backend/src/adapters/controllers/onboarding.controller.ts
- backend/prisma/seed.ts
- backend/scripts/admin-accounts.test.cjs
- backend/scripts/admin-accounts.integration.test.cjs
- frontend/src/app/admin/(protected)/access/page.tsx
- frontend/src/components/admin/sidebar.tsx
- frontend/src/lib/admin-access.ts
- frontend/src/lib/api-client.ts
- frontend/tests/admin-accounts.test.cjs
- BETA_ACCESS_MANAGEMENT_REPORT.md

## 11. Tests/results

Passed:

- 82 existing backend regression tests covering readiness/bootstrap, Staff/onboarding fixes, PIN behavior and exports.
- 4 new backend tests: password boundaries, safe error handling, controlled denial, OWNER/WORKER global guard behavior.
- Existing authorization.service.spec.ts regression suite.
- 71 frontend tests, including 5 new actual-component tests for catalog options, password clearing, editable payload boundaries, branch clearing on company change and protected/WORKER controls.
- Backend and frontend TypeScript checks.
- Prisma validate and generate (5.22.0).
- Backend build and frontend production build, including `/admin/access`.
- git diff --check and integration-script syntax check.

Frontend build emitted a webpack cache snapshot warning but completed successfully.

### Integration completion

PostgreSQL (`localhost:5432`) and Redis (`localhost:6379`) were already running in the repository's local containers and healthy. Explicit checks returned `accepting connections` and `PONG`. The isolated nexustaff_test database already existed and was usable; no database creation, migration, reset or db push was necessary. The local test wrapper verifies the database name and localhost endpoint, and uses Redis database 15. Existing Docker app containers were left untouched; browser acceptance used the current working-tree backend on 3101 and frontend on 3100.

All **14/14 integration cases passed** against real PostgreSQL:

1. SUPER_ADMIN creates a multi-property manager with bcrypt credentials and administrative assignments only.
2. OWNER creates an ADMIN in its own company; foreign company and peer/platform roles denied.
3. ADMIN without delegation denied, including spoofed principal role.
4. MANAGER without delegation denied.
5. LOCATION_ADMIN without delegation denied.
6. SUPERVISOR without delegation denied.
7. WORKER denied.
8. Delegated ADMIN constrained by property, permissions and role rank.
9. Delegated MANAGER constrained by property, permissions and role rank.
10. Delegated LOCATION_ADMIN constrained by property, permissions and role rank.
11. Real login/reset succeeds with the new password, rejects the old password and excludes credentials from audits.
12. JWT rehydrates changed database grants; Staff/Attendance/Reports scope and financial masking remain enforced.
13. Self/platform mutations and legacy Staff administrative mutations rejected.
14. Concurrent stale updates have exactly one winner; inactive login and JWT validation rejected.

The first run had 13 passes and one test-setup failure: the manually instantiated JwtService did not receive the isolated JWT signing secret. The test now supplies the same local test secret used by the auth environment. The complete 14-case suite then passed. No application, authorization or UI defect was found; no production source changes were required in this continuation.

### Browser acceptance

Verified in the real local browser against the integrated API, using a newly created disposable company with Miami/Orlando branches and synthetic accounts:

- SUPER_ADMIN opens the account list and creates a LOCATION_ADMIN assigned only to Miami with explicit permissions.
- SUPER_ADMIN creates a company OWNER, edits the branch administrator's name, resets its password, and deactivates the OWNER; the list shows the persisted changes and Inactive status.
- Reset password succeeds and the branch administrator signs in with the replacement password.
- Add/edit forms expose company, role, branch and permission controls. A create attempt without a branch displays `At least one authorized branch is required.`
- Password input is masked, clears after failed submission and after cancel/reopen, and is removed after successful save; no password is displayed in the account list.
- LOCATION_ADMIN sees only Miami in the header and assignment selector, only SUPERVISOR in the role selector, and only its own permissions for delegation. It successfully creates a scoped SUPERVISOR, which appears in its list.
- Selecting Miami in the header retains the authorized context. Orlando and unrelated company branches are absent for LOCATION_ADMIN.
- WORKER login to the Admin Portal is rejected with the kiosk guidance; direct `/admin/access` navigation returns to login.
- Desktop screenshot inspection confirmed the account table and controls render coherently within the existing design.

Focused checks repeated after the test setup fix: 4/4 backend account tests and 5/5 frontend account-component tests. Existing successful production builds, full suites, TypeScript and Prisma checks above remain applicable because this continuation changes no application source. Unrelated expensive suites were not repeated.

Additional live HTTP checks passed using the running backend and real Redis: old password returns 401, replacement password succeeds, disabled OWNER returns 401, forged unauthorized-property and same-role creation return 403, and an authenticated WORKER receives 403 from the accounts endpoint. Persisted names, administrative grants and credential-free audit records were checked in PostgreSQL. Login throttling correctly returned 429 during rapid repeated checks; after waiting for its normal window, all checks passed without changing rate limits. All newly created acceptance accounts/company/branches were removed after verification; older local fixtures were preserved. Final git diff --check passed.

## 12. Remaining beta blockers

The previous dependency and browser-acceptance blockers are resolved. The existing password/session limitations documented in section 7 remain unchanged. This verdict concerns readiness for beta polish, not deployment authorization.

Continuation changes: only backend/scripts/admin-accounts.integration.test.cjs (JwtService test configuration) and this report. No existing client or production accounts were used. No Render or remote database connection, deployment, schema change or authorization redesign was performed.

### Finalization after interrupted session

Reviewed the current working tree and retained all valid implementation and tests: seven modified tracked files and seven new files, exactly the fourteen paths listed in section 10. No temporary `.local-access-*` fixture files remain. The authentication implementation has no Git diff; the JwtService correction is confined to `backend/scripts/admin-accounts.integration.test.cjs`, which instantiates it with the existing local test signing secret.

The prior tool results reliably confirm 14 tests passed, zero failed, followed by successful focused regressions and browser/HTTP acceptance. No application source changed after the successful builds. Accordingly, this close-out did not recreate fixtures, rerun acceptance, rebuild, or repeat unrelated suites. The only file updated during this finalization is this report. `git diff --check` passed again; Git emitted only line-ending conversion notices, not whitespace errors. No remaining blocker was identified within the requested Access Management scope. No deployment was performed.

READY FOR BETA POLISH PASS

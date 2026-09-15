# NEXUSTAFF PHASE 4.7B BRANCH LOCATION BETA FIX REPORT

Verified 2026-09-15 against the current repository and local Docker environment. No remote deployment, Phase 5, payroll, invoice, final XLSX, Prisma schema changes or migration edits were performed.

## 1. Files modified

Production files:
- `backend/src/application/services/location.service.ts`
- `frontend/src/app/admin/(protected)/locations/page.tsx`
- `frontend/src/app/admin/(protected)/employees/page.tsx`
- `frontend/src/app/clock/page.tsx`
- `frontend/src/app/clock/layout.tsx`
- `frontend/src/app/layout.tsx`
- `frontend/src/components/admin/beta-attendance.tsx`
- `frontend/src/lib/api-client.ts`
- `frontend/src/components/timezone-select.tsx` (new)
- `frontend/src/lib/property-form.ts` (new)
- `frontend/src/lib/api-error.ts` (new)

Regression files:
- `backend/scripts/phase47b.test.cjs` (new)
- `frontend/tests/phase47b.test.cjs` (new)

This report is also new. Generated tracked TypeScript build metadata was restored to its original contents.

## 2. Timezone selector implementation

Required native select with readable city labels and IANA values. Uses `Intl.supportedValuesOf('timeZone')` after mounting; no address-based inference and no new dependency. A seven-entry fallback includes the six requested American zones and UTC. Valid existing zones remain selectable even if absent from the enumeration. Invalid saved values require a replacement selection. The browser displayed `Mérida — America/Merida`; the value submitted is `America/Merida`. Free-text `Merida` is not an option.

## 3. Timezone normalization

Form state now uses `timezone`, not `city`. Create/edit payloads trim name, address and timezone; create also trims code. Backend trims name/address on create and edit, code on create, and timezone before validation. Internal whitespace is preserved. The edit form continues to leave the property code unchanged.

## 4. Backend validation behavior

`America/Merida` accepted; `Merida`, blank and non-string values rejected. Surrounding whitespace is accepted after trimming. Blank names/addresses receive controlled 400 errors. IANA validation remains authoritative through `Intl.DateTimeFormat`; company resolution and authorization are unchanged. No uniqueness constraint or migration was added.

## 5. Frontend error handling

`ApiError` preserves HTTP status. `safePropertyError` exposes only reviewed exact messages for 400/403/409; a status alone is insufficient. Unknown strings, SQL, Prisma/Redis internals, paths, stack traces, plain errors and all 500 responses remain generic in Locations. Create, update and delete use the same helper. Error messages appear inside the relevant modal and remain visible while correcting input.

Actual browser acceptance: editing the test property with a whitespace-only name displayed `Property name is required.`; correcting it saved successfully. Controlled 403/409 and internal-error display paths were covered by automated tests, not by changing the real administrator's permissions or injecting a production failure.

## 6. kioskCode decision and evidence

Removed the editable pairing-code input, form state and submitted field, plus the misleading device-code card. Replaced the card with a link to `/clock/setup`. Remaining source references are the compatibility property in the location store/mock type and the backend list projection derived from `locationCode`. No active terminal pairing flow uses that value.

The unchanged setup flow loads authorized properties, requires explicit property selection and confirmation, saves `kiosk_terminal_config`, then opens `/clock`. Browser verification completed that flow successfully, including reload persistence. No database fields were removed and no second pairing architecture was introduced.

## 7. Company behavior preserved

The company-bound bootstrap SUPER_ADMIN created the new property without frontend companyId. Regression tests preserve the fallback to the actor's company, require explicit company context for a global SUPER_ADMIN with null companyId, and prevent non-super actors from overriding their company through the payload. An explicit multi-company selector remains a future Admin UX requirement.

## 8. Staff terminology changes

Updated the staff directory heading, creation/save actions, identity editor and messages; attendance table headers; clock staff-number label; and page metadata. Internal `employeeNumber`, EmployeeAssignment, API identifiers, classes and `/admin/employees` / `/onboarding/employees` routes retain their names.

## 9. Tests added

20 new tests: eight backend service tests and twelve frontend tests. Coverage includes valid/invalid/trimmed timezone, required text, company fallback and global/non-super cases, selector/fallback behavior, real form payload submission, visible controlled errors, safe internal-error handling, HTTP status preservation by the real API client, terminal context independent of kioskCode, and presentation terminology without API changes.

## 10. Total tests passing

90 automated tests/scenarios passed in this run, with no failures:
- Backend new regression: 8 (`node --test scripts/phase47b.test.cjs`).
- Backend existing Phase 4.1 regression: 43 (`node -r ts-node/register -r tsconfig-paths/register src/domain/security/phase41-remediation.spec.ts`).
- Frontend existing and new tests: 39 (`node --test tests/*.test.cjs`).

This is the total executed for this phase, not a claim that every historical database/security suite was rerun. Existing tests were retained unchanged.

## 11. Backend build/typecheck

PASS: `npm run build` locally and in the Docker Node 20 build; `tsc --noEmit` locally. The default Windows npm launcher pointed to a missing roaming installation, so local npm was invoked through the existing `C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js`. No npm installation or configuration changes were made.

## 12. Frontend build/typecheck

PASS: production `npm run build` locally and in Docker; final Docker build includes the Staff metadata changes. `tsc --noEmit` passed for final source. Build API URL was `http://localhost:3001/api/v1`. Existing non-blocking npm/webpack cache and Compose-version warnings do not represent test failures. ESLint was not configured.

## 13. Prisma validation

PASS: `prisma validate`. Schema and migration files unchanged. Existing Docker startup migration command was retained; no new migration was created. PostgreSQL and Redis containers/volumes were preserved. `git diff --check` passed.

## 14. Browser Property creation result

PASS against rebuilt Docker frontend/backend with the real bootstrap SUPER_ADMIN:
1. Selected Mérida in the required timezone selector; no editable kiosk-code field.
2. Created `PH47B Beta Acceptance` (`LOC-8727`) using surrounding whitespace in name/address. List and edit form showed trimmed borders; internal address whitespace was preserved.
3. Reload retained the property.
4. Whitespace-only name during edit produced a useful controlled validation message inside the modal; corrected edit saved.
5. Created department `PH47B Operations`, position `PH47B Attendant` and test Staff `EMP-PH47B-20260915` through the UI.
6. Staff persisted after reload, with active assignment and server-reported `Clock Ready`.
7. Paired the test terminal through `/clock/setup`; `/clock` retained the property after reload and recognized the new Staff, offering Clock In. No attendance punch was submitted. Verification was reset afterwards.

One initial Staff submission failed with an email uniqueness error; explicitly clearing the optional email field and resubmitting succeeded. Logs identify the unique email constraint, but the exact first submitted email was not captured. Do not infer a missing-email generation defect from that alone.

Local test records remain available for review. This browser's terminal configuration is now paired to `PH47B Beta Acceptance`; existing business records and other browser terminal configurations were not edited.

## 15. Remaining P0 beta blockers

None confirmed in the requested local Property → Department → Position → Staff → terminal-recognition acceptance scope. This scoped verification is not a new full-system audit or a remote deployment approval.

## 16. Remaining P1/P2

- P1: Staff onboarding email uniqueness violations currently return a generic 500. Recommend a controlled 409 and regression coverage in a separate focused change. The valid-data workflow succeeds.
- P1: access tokens expire after 15 minutes while persisted UI authentication can remain visible. Acceptance required signing in again. Session expiry/renewal UX needs a separate follow-up; token lifetimes and authentication architecture were not changed here.
- P2: browser credential autofill was observed placing an administrator identifier into a clock staff-number field. Review autofill behavior in identity forms; it was not proven to be the cause of the initial Staff email conflict.
- P2: explicit multi-company Company selection for global SUPER_ADMIN remains future Admin UX. The current company-bound bootstrap account does not require it.

## 17. Final verdict

**BETA FUNCTIONALLY READY** for the verified local Time & Attendance beta flow, with the non-blocking P1/P2 follow-ups above. No remote deployment performed. Stop at Phase 4.7B.

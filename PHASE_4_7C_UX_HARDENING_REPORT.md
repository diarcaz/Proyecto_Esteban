# NEXUSTAFF PHASE 4.7C CLIENT-BETA UX HARDENING REPORT

Verified 2026-09-15 against the current live repository and rebuilt local Docker environment. Phase 4.7B remains approved. No remote deployment, Phase 5, financial features, Prisma schema changes or migration edits were performed.

## 1. Duplicate email root cause/fix

Staff creation uses `POST /api/v1/onboarding/employees` → `OnboardingController.create` → `OnboardingService.create` → transactional `tx.user.create`. Prisma's P2002 previously escaped as an unexpected error and produced HTTP 500. The user-create operation now catches the actual Prisma known-request error and returns `ConflictException` (409) with `A staff member with this email already exists.` for the email target. The transaction aborts normally; uniqueness is still enforced by PostgreSQL. No constraint names, query text, Prisma messages, submitted emails or stack traces are included in the controlled response.

## 2. Duplicate employee number behavior

P2002 targeting physical `employee_number` or Prisma `employeeNumber` returns 409 with `A staff member with this staff number already exists.` An unrecognized P2002 target gets a generic safe identity-conflict message. Other errors are not incorrectly labeled as duplicates. This handling is limited to user creation, so an assignment/catalog failure is not misreported as a duplicate identity.

## 3. Session-expiry implementation decision

The backend issues 15-minute access tokens and seven-day refresh tokens and has a Redis-backed rotating refresh endpoint. However, the actual frontend stores only the access token and user/Zustand state, discards the returned refresh token, and has no refresh transport/storage flow. Automatic renewal would introduce a new client token-storage decision. This phase therefore uses the explicitly authorized session-recovery option rather than redesigning authentication.

A 401 on a protected API request clears in-memory Zustand authentication and only the three existing authentication storage entries, then redirects Admin or terminal setup to `/admin/login?session=expired`. Login shows `Your session expired. Please sign in again.` A single-flight guard prevents concurrent redirects; comparison against the request's original token prevents an old response from clearing a newer login. Successful login resets the guard. Login, refresh and public kiosk requests do not trigger recovery and no longer attach an unrelated administrator bearer token. Explicit logout retains its existing behavior. JWT durations and backend auth semantics are unchanged.

## 4. Auth/session files modified

- `frontend/src/lib/session-recovery.ts` (new)
- `frontend/src/lib/api-client.ts`
- `frontend/src/store/use-auth-store.ts`
- `frontend/src/app/admin/(auth)/login/page.tsx`

## 5. Terminal pairing preservation

Recovery reuses the existing auth-only cleanup list: `nexustaff_token`, `nexustaff_user`, `nexustaff-auth-store`. `kiosk_terminal_config` and unrelated storage are preserved. Automated tests exercise the actual Zustand store and logout. In the browser, the expired Admin session redirected to login; opening `/clock` afterwards still showed the previously paired `PH47B Beta Acceptance` property. No terminal re-pairing was necessary in this phase.

## 6. Time Zone UX result

The field is labeled `Time Zone`. Primary option labels show readable city and zone names, with current offsets obtained from `Intl.DateTimeFormat` `longGeneric` and `shortOffset` parts. There are no permanent hardcoded UTC offsets. Tests check New York summer/winter offsets. Unsupported formatting gracefully falls back to a cleaned city label.

Actual browser labels on the verification date:
- Mérida — Central Standard Time (UTC-6)
- New York — Eastern Time (UTC-4)
- Chicago — Central Time (UTC-5)
- Los Angeles — Pacific Time (UTC-7)

The selector's DOM value remained `America/Merida`; readable labels do not replace IANA payload/storage values. Existing enumeration and small fallback remain. Help text explains that offsets are for today and may change with daylight saving time.

## 7. Autofill result

Admin login uses named username/current-password controls. Staff creation uses a separate autocomplete section with given-name, family-name, email and new-password semantics; identity editing uses Staff name semantics and PIN replacement uses new-password. There is no Staff email editor in the current UI, so none was invented.

Clock identifiers have dedicated names, autocomplete disabled because there is no standard employee-number token, and read-only-until-focus guards plus a password-manager ignore hint. Clock PIN entry retains its existing authentication semantics; it is not falsely marked as a one-time code or a newly created password. Keyboard focus enables normal typing; the existing keypad still works through state updates.

Browser acceptance: Staff Number was empty when `/clock` opened and remained empty on focus. No administrator credential was visibly inserted during this test. Staff creation also started with blank identity fields. These attributes reduce autofill interference; third-party password managers may apply their own policies.

## 8. Staff terminology status

Phase 4.7B Staff terminology is preserved. Internal employeeNumber, EmployeeAssignment, route names, API symbols and backend classes were not renamed. The approved Time Zone presentation changes do not alter stored identifiers.

## 9. Files modified in this phase

Production:
- `backend/src/application/services/onboarding.service.ts`
- `frontend/src/lib/api-client.ts`
- `frontend/src/lib/session-recovery.ts` (new)
- `frontend/src/store/use-auth-store.ts`
- `frontend/src/app/admin/(auth)/login/page.tsx`
- `frontend/src/app/admin/(protected)/employees/page.tsx`
- `frontend/src/app/clock/page.tsx`
- `frontend/src/lib/property-form.ts`
- `frontend/src/components/timezone-select.tsx`

Tests:
- `backend/scripts/phase47c.test.cjs` (new)
- `frontend/tests/phase47c.test.cjs` (new)
- `frontend/tests/phase47b.test.cjs`: updated its display-label assertion for the approved human-readable presentation; canonical-value and all other coverage retained.

This report is new. Prior uncommitted 4.7B changes remain intact; they are not additional 4.7C changes. Generated tracked TypeScript build metadata was restored to its original contents.

## 10. Tests added

13 new tests: six backend and seven frontend. Cover exact safe conflict messages/status, physical and Prisma number field names, generic duplicate fallback, no assignment creation after user conflict, valid creation, other failures, concurrent 401 handling, stale-response protection, public-route isolation, actual Zustand cleanup/logout with pairing preservation, DST-aware labels, canonical payloads and intentional autofill attributes.

## 11. Test results

60 tests passed, zero failures in the final run:
- Backend: 14 (`node --test scripts/phase47c.test.cjs scripts/phase47b.test.cjs`).
- Frontend: 46 (`node --test tests/*.test.cjs`).

Existing frontend suites and 4.7B backend regression coverage passed. The full historical security/integration suite was not repeated, as requested. An initial frontend test-environment failure was resolved by consistently using `window.localStorage` in the API client; the final full frontend run passed.

## 12. Backend build/typecheck

PASS: local and Docker `npm run build`, and local `tsc --noEmit`. Local npm uses the working installed npm CLI directly because the default Windows roaming launcher was broken; no npm configuration was changed.

## 13. Frontend build/typecheck

PASS: local production build, final Docker production build, and final `tsc --noEmit`. Docker was rebuilt with the existing local API URL. No new dependency or ESLint configuration was added.

## 14. Prisma validation

PASS: `prisma validate`; no diff under `backend/prisma`. `git diff --check` passed. Existing database uniqueness, schema, migrations and Docker volumes remain unchanged. Only backend/frontend containers were rebuilt/recreated, preserving their existing secret values in memory without displaying them.

## 15. Browser acceptance

PASS in the updated Docker application:
- The old expired session redirected to login with the controlled expiry notice; fresh login restored working Admin navigation.
- Existing terminal pairing survived cleanup; Clock Staff Number remained empty on load and focus.
- Created `EMP-PH47C-A` with a dedicated test email and the existing test property/department/position; server reported `Clock Ready`.
- A second Staff creation with the same email and a different number displayed the specific duplicate-email message.
- Changing to a new email but reusing the first number displayed the specific duplicate-number message.
- Correcting both identifiers saved `EMP-PH47C-B` with `Clock Ready`.
- Time Zone options displayed readable current offsets, while the selected DOM value remained `America/Merida`.

The safe 409 status and response shape are asserted in backend regression tests; browser acceptance verified the actual displayed messages and successful recovery. No network-capture artifact is claimed. The two isolated Staff test records remain for review. No punches or remote actions were submitted.

## 16. Remaining P0 blockers

None confirmed in the requested 4.7C scope. This is focused UX acceptance on top of the already approved local beta, not another infrastructure/security audit.

## 17. Remaining P1/P2

No unresolved P1 from the assigned email/number conflict, expired-session recovery or tested autofill scenarios. Non-blocking follow-ups:
- Explicit Company selection for global multi-company administrators remains future Admin UX.
- Automatic refresh remains intentionally unimplemented; after expiry, users sign in again through the controlled recovery flow.
- Broader password-manager/browser coverage may require additional autofill tuning.

## 18. Verdict

**READY FOR REMOTE BETA DEPLOYMENT** from the verified client-beta UX scope. Remote deployment has not been performed or authorized by this report. Stop at Phase 4.7C; do not start Phase 5.

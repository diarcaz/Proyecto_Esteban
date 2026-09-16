> Historical report. Routing, PIN lookup and exports are superseded by UX_RECOVERY_CORRECTIVE_REPORT.md. Do not use its shared-landing, bounded PIN scan or loaded-window export guidance for deployment.

# NEXUSTAFF — LEGACY UX RECOVERY / ADMIN + KIOSK RESTORATION

Implemented against the written UX brief and the existing design system. The attachment contained no legacy screenshots; exact visual matching has not been verified against the approved originals.

## Restored experience

- Dark administration shell with sidebar, branch selector, role/profile chip, responsive compact navigation and tablet-kiosk shortcut. Modules remain filtered by the existing route permissions. SUPER_ADMIN sees All Authorized Branches; other roles see only the server-authorized scope.
- Live Overview: four metric-card positions, recent recorded activity and styled attendance table. Unsupported operational metrics display unavailable values instead of invented totals.
- Live Attendance Logs: search, real punch-type filters, event badges, refresh and CSV download. The table and export contain only the loaded server-authorized window of up to 200 events. Timestamps are explicitly UTC. CSV cells escape quotes and neutralize formula-like values.
- Staff Directory: searchable concise table, account-status labels, management buttons and expandable details. Clicking the selected staff member closes the panel, clears PIN/editor state and invalidates pending requests. Switching staff ignores stale responses. Canonical assignment creation, identity editing, server readiness and authorized PIN operations remain intact.
- Shift Schedules: weekly matrix and week navigation, clearly marked unavailable. It does not invent shifts or pretend to publish schedules.
- Reports & Payroll: reporting cards and a link to the real attendance export when TIME_VIEW is authorized. Payroll/invoice exports remain explicitly unavailable, with the existing financial permissions preserved.
- Branch Locations: retained dark branch cards and timezone selection, applied topbar scope, corrected the misleading on-site count to linked staff records and removed the unsupported Active & Synced assertion. Edit/delete controls retain permissions.
- Settings: real links to branch configuration and kiosk setup, account context, explicit unavailable policy/audit sections. Removed dormant mock audit data and pseudo-save forms.
- Landing/login: branded choice between administration and kiosk, and a direct kiosk link from login. No demo credentials or offline-mode fallback.
- Kiosk: dark two-column touchscreen view, analog/digital clock using branch timezone, PIN keypad, staff identity/shift context after authentication, only server-allowed punch buttons and Not you? Clear PIN. Existing inactivity and confirmation resets remain. Setup retains authorized branch selection and explicit confirmation.

## Backend change needed for PIN-only identification

Added public `POST /api/v1/attendance/kiosk-identify` with a dedicated validated PIN/property DTO. The existing status and punch contracts still require employee number and PIN; the frontend supplies the employee number returned by successful identification when recording a punch.

The new resolver selects only ACTIVE users in the property's company with current active canonical EmployeeAssignments at that property. It checks bcrypt hashes server-side, refuses zero or multiple matches, then invokes the existing status flow. That flow still enforces the existing employee account lockout, assignment ambiguity checks and authoritative shift evaluation. Punch submission independently revalidates identity and context through the unchanged punch flow. No PIN decryption, PIN/hash disclosure, client roster lookup or browser credential persistence was added.

HTTP throttling remains in place; strict atomic Redis counters additionally bound PIN-only attempts across clients/processes to 10 per branch per 60-second window, including successful attempts. Five failed or ambiguous PIN lookups also block branch identification for the remainder of a 15-minute window. Neither counter resets on a successful identification, so another known PIN cannot unlock guessing attempts. Redis failure closes authentication. The new public endpoint does not receive the administrator token or trigger administrator logout on a PIN error.

No Prisma schema, migration, authorization policy, business calculation or database configuration was changed. No deployment was performed.

## Operational limits and unresolved acceptance

1. **PIN-only capacity:** bcrypt-only compatibility requires a bounded candidate scan. At most 100 eligible users with a PIN hash per branch are supported by this implementation. The query requests 101 and fails closed if the limit is exceeded; it never silently truncates and risks missing a duplicate. A synthetic local measurement of 100 bcrypt cost-10 comparisons took approximately 4.3 seconds, excluding database/network time. Larger branches or higher arrival rates require a separately reviewed indexed identity strategy; this is not an unlimited-scale PIN lookup.
2. **Duplicate PINs:** existing creation/reset flows do not guarantee branch-wide PIN uniqueness. Duplicate eligible PINs prevent identification rather than selecting a staff member arbitrarily. An authorized administrator must assign distinct PINs through the current secure flow. No existing PIN was reset automatically.
   Failed/ambiguous entries share a branch-level lockout because a wrong PIN alone cannot identify a target account. Five failures can temporarily block other staff at that kiosk/branch too; this is a deliberate fail-closed tradeoff to verify during pilot acceptance.
3. **Visual reference:** original approved screenshots are still needed for exact comparison. Public landing, login and the unconfigured kiosk were inspected in the browser. Authenticated admin and paired-kiosk live acceptance remain unverified.
4. **Local integration environment:** the existing Phase 4.6 PostgreSQL integration suite failed in its setup hook because `nexustaff_test` does not exist on its configured `localhost:5432` server. No tests in that suite reached their functional assertions. No database was created or substituted to conceal this blocker.
5. **Unsupported features:** real occupancy, punctuality, lateness, approval totals, schedule editing/publishing, financial exports and settings/audit editing were not invented. They remain visibly unavailable where the current secure contracts do not support the restored view.

## Files changed

| Area | Files |
| --- | --- |
| PIN-only backend | `backend/src/adapters/controllers/attendance.controller.ts`, `backend/src/adapters/dtos/attendance.dtos.ts`, `backend/src/application/services/attendance.service.ts` |
| Shell and branch context | `frontend/src/app/admin/(protected)/layout.tsx`, `frontend/src/components/admin/sidebar.tsx`, `frontend/src/components/admin/location-switcher.tsx`, `frontend/src/app/globals.css` |
| Admin pages | `frontend/src/app/admin/(protected)/page.tsx`, `employees/page.tsx`, `locations/page.tsx`, `schedules/page.tsx`, `settings/page.tsx` within the same protected route directory; `frontend/src/components/admin/beta-attendance.tsx`, `frontend/src/components/reports/reports-view.tsx` |
| Landing and kiosk | `frontend/src/app/page.tsx`, `frontend/src/app/admin/(auth)/login/page.tsx`, `frontend/src/app/clock/layout.tsx`, `frontend/src/app/clock/page.tsx`, `frontend/src/app/clock/setup/page.tsx`, new `frontend/src/components/kiosk/branch-clock.tsx` |
| API/export helpers | `frontend/src/lib/api-client.ts`, `frontend/src/lib/session-recovery.ts`, new `frontend/src/lib/attendance-export.ts` |
| Tests | New `backend/scripts/legacy-ux.test.cjs` and `frontend/tests/legacy-ux.test.cjs`; updated `frontend/tests/beta-readiness.test.cjs`, `phase47b.test.cjs`, `phase47c.test.cjs` |
| Documentation | This report |

## Validation

- Frontend regression suite: 52 passed. The new six-test suite verifies actual staff open/close/switch handlers, late-response rejection, CSV escaping, branch-clock date boundary and PIN-only identification followed by an allowed punch and reset.
- Backend non-database suites: 51 passed before adding the final branch-failure-lockout test; the complete ten-test PIN suite then passed (52 distinct backend tests total). Coverage includes validation, branch/tenant query constraints, duplicate rejection, account/branch lockout, assignment ambiguity, Redis failure, rate limit, capacity and response sanitization.
- Existing authorization/security suite: passed, including tenant isolation, guards, staff permissions, work-shift integrity, portal separation and Phase 4.1/4.2 regressions.
- Frontend Next build and backend Nest build: passed. Frontend build used the explicit local development API URL; production deployment still requires its real HTTPS API URL. Next emitted a nonfatal webpack cache warning.
- Frontend/backend TypeScript checks and Prisma validate: passed.
- `git diff --check`: passed.
- Database integration: blocked as described above; not counted as passed.

The requested UX changes are implemented and locally code-validated. Final client acceptance requires the reference screenshots and an available test backend/database for authenticated browser verification, including branch-admin isolation and the paired PIN-to-punch journey.

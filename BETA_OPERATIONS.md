# NexuStaff beta operations — functional hardening

## Functional pilot addendum — 2026-09-22

This section governs the current release. Earlier linked reports are historical evidence, not a remote acceptance certificate.

- Normal startup: migrations → optional explicitly enabled initial bootstrap → Nest. The existing beta already has an administrator: BOOTSTRAP_ADMIN_ON_START must be absent/false and one-time BOOTSTRAP_* inputs removed. Do not seed, backfill PINs, reset data or overwrite passwords on startup. Apply the additive `20260922230000_optional_branch_approval` migration through migrate deploy before running the new application.
- OWNER can create lower administrative accounts through Access & Users. Status editing supports deactivation/reactivation; permissions and roles remain delegation-limited. Staff details now includes Active/Inactive; inactive Staff remain listed for reactivation. Open shifts block Staff deactivation to preserve operational continuity and history.
- Staff creation, Department/Position, effective assignment dates and PIN are ordinary app/API operations; 20 sequential creations were verified. Existing assignment end-date editing is deferred: deactivate and create a valid non-overlapping replacement. No database editing or bulk import is required.
- Time Reports → select Branch and period → review exposes **Require approval before finalizing hours** to authorized company admins. This is persisted per Branch, default ON. Policy changes are audited and invalidate prior final state. ON requires submission/configured approval steps before closing. OFF permits review/export with `NOT_REQUIRED`; it does not invent an APPROVED/CLOSED artifact. Basic workflow setup is available in the UI; ordered multi-step configuration uses the authorized API.
- Expand Time corrections in period review to select the canonical Staff shift, type, verified timestamp and reason. Timestamp entry explicitly uses the operator device timezone and converts to UTC. TIME_APPROVE reviewers approve/reject. Raw evidence is immutable. Approved corrections reopen relevant ON periods as CORRECTION_REQUIRED; affected coworkers must repeat the configured review workflow. OFF reports immediately reflect the corrected data without fake approval.
- Missing clock-out remains incomplete with no fabricated end. CSVs retain incomplete rows and explicitly label partial completed-shift totals. The next eligible day's clock-in is independent. Race losers receive a controlled conflict and a credential-free audit event; richer live alerts remain future work.
- Branch deletion is denied to preserve history; Branch archival is not implemented. Avoid changing timezone on populated Branches casually: existing period boundaries remain persisted. Verify calendar policy before operational use.
- Old-format JWT sessions must sign in once after this release. Password reset invalidates old access/refresh credentials. Status/grants/roles are rehydrated on subsequent requests. Refresh rotation is atomic. Logout clears the browser and revokes refresh; a copied access token may remain valid for its remaining 15-minute lifetime. Reactivation restores eligibility; reset password before reactivating an account suspected of compromise.
- Current baseline was clean commit `9852ca55` (`beta v.1`). Capture reviewed audit changes as a release commit/image before deployment; the baseline hash alone does not identify this uncommitted tree. Preserve lockfiles, image and configuration revision.
- No provider backup is verified. Assign backup ownership and agree retention, RPO and RTO. Require scheduled PostgreSQL backups and an actual isolated restore drill; verify assignments, raw/effective attendance, approvals and PIN operation after recovery. A secure custom-format pg_dump/pg_restore workflow is possible, with connections supplied through a secret store rather than shell history. Never restore over live data as application rollback.
- Back up stable, independent PIN_ENCRYPTION_KEY and PIN_LOOKUP_KEY separately under restricted recovery access. Database recovery without those keys is incomplete. Redis state loss can remove sessions and reset abuse budgets; it must not remove canonical attendance. Specify persistence/availability and outage handling. Graceful local Redis/PostgreSQL restarts were tested without deleting volumes; this is not backup/restore evidence.
- Roll back only to a compatible application image while preserving data/secrets. Keep the new boolean column; do not reverse migration history or run reset/db push. An older image that ignores OFF policy is not operationally compatible with an approval-optional Branch. Pause use and forward-fix rather than silently changing that policy.

### Remote-only gates before real pilot data

1. Build and run the actual release Docker images with their declared Node runtime (local validation used Node 24; Docker specifies Node 20). Verify migration status, existing login, /health, HTTPS, exact CORS and the frontend's compiled API URL. Do not re-enable bootstrap.
2. Verify the selected provider's actual persistence, retention, backups and isolated restore, plus secret recovery. Free-plan assumptions alone are unsuitable proof for multi-day real attendance data. No paid resources were configured here.
3. Determine actual req.ip through the deployed proxy. In an isolated remote test, compare network A and independent network B, then two devices behind one NAT; repeat with forged X-Forwarded-For/Forwarded and through every expected proxy hop. Record only non-secret diagnostics. Confirm spoofing cannot reset a budget and distinct networks are not all counted as the proxy. Do not blindly enable trust proxy=true; configure only verified hops/subnets if necessary.
4. Measure 429/reset behavior for login 5/minute, generic HTTP 100/minute, identify 60/minute, kiosk status 15/minute and punch 10/minute. Independently verify Redis client/property/PIN budgets, wrong-PIN lockout, unrelated Staff, outage 503 and recovery. Generic throttling is per process; multiple replicas require an explicitly accepted topology.
5. Verify Socket.IO polling/upgrade, foreign origin/property denial, and actual tablets: pairing, complete two-lunch sequence, privacy reset, two-device conflict, removed Branch with the same token, correction/reapproval and authoritative CSV. Test required viewport sizes and operator timezone conventions. No new live notification platform is promised.

Status: updated 2026-09-22. FUNCTIONAL_BETA_HARDENING_REPORT.md and the functional pilot addendum below supersede earlier phase assumptions. No remote deployment or provider backup was verified.

## Release gates

- Employee onboarding is resolved: use Employees → Create Employee, select Property → Department → Position, enter identity/PIN and effective dates, and save. The employee and canonical EmployeeAssignment are created atomically. Add Department/Position inline requires PROPERTY_MANAGE. Additional assignments and deactivation use STAFF_EDIT; reads use STAFF_VIEW. Legacy access records remain secondary and never authorize clocking.
- Verify real proxy/client-IP behavior before a kiosk pilot. Nest currently trusts the socket peer, not arbitrary forwarded headers. The manifest does not establish a fixed trusted hop count or source range. This can group different devices under one HTTP throttle behind Render. Obtain the topology from the provider, then configure only verified proxy addresses/hops and test spoofed headers; never set trust proxy=true blindly.
- Select a persistent Redis plan and a backed-up, non-expiring PostgreSQL plan before real pilot data. The manifest's free plans are template/demo defaults, not an approved operational service level. No paid resources have been ordered.
- Perform real remote smoke acceptance; local unit/build success does not replace it.

## Dedicated deployment and variable mapping

1. Record the source commit/release to deploy. Review the current changes and retain the last known-good application image/commit. Do not use the former generic service names to accidentally modify an existing environment. The template uses nexustaff-beta-backend, nexustaff-beta-frontend, nexustaff-beta-db and nexustaff-beta-redis.
2. In the provider dashboard create a dedicated PostgreSQL database named nexustaff_beta and a dedicated Redis/Key Value instance in the same region/private network as the backend. Do not reuse nexustaff_test, development or production data. Restrict external database/Redis access to operator needs. Confirm service plan, retention, persistence and cost manually before creating resources.
3. Reserve/confirm the actual HTTPS frontend and backend hostnames. Render may assign different hostnames; do not infer them from service names. Configure the exact values below before building.

Backend provider environment (values must remain in the provider store):

| Variable | Requirement |
| --- | --- |
| NODE_ENV | production |
| PORT | 3001 or provider assigned port |
| DATABASE_URL | Dedicated beta PostgreSQL internal connection string; Blueprint maps fromDatabase.connectionString |
| REDIS_URL | Exact provider Connect-menu internal URL, including username/password when internal auth is enabled. redis:// for non-TLS internal links or rediss:// when TLS is required. This takes precedence over separate Redis fields. |
| JWT_SECRET | Newly generated cryptographically strong secret, minimum 32 characters. Render generateValue creates a 256-bit value for a NEW variable. Verify existing service variables are rotated manually; reapplying a Blueprint does not rotate existing secrets. |
| PIN_ENCRYPTION_KEY | Required raw string, trimmed length at least 16; recommend a random 32-byte key encoded as hex (64 characters) or base64. Render generateValue also supplies sufficient length. No fallback. Keep this key stable and securely backed up with database recovery materials. |
| PIN_LOOKUP_KEY | Required independent random 32-byte secret encoded as exactly 64 hex characters. No default. Keep stable and securely backed up. Follow the explicit dry-run/apply enrollment procedure in UX_RECOVERY_CORRECTIVE_REPORT.md before enabling clocks. |
| CORS_ORIGIN | Comma-separated exact authorized HTTPS frontend origins, no paths, trailing slash, wildcard or localhost. Example domain shapes only: https://your-beta-frontend.example |
| JWT_EXPIRATION | Legacy setting; issued access tokens explicitly expire in 15 minutes and refresh tokens in seven days. Do not assume this variable overrides those lifetimes. |
| ENABLE_SWAGGER | Leave unset/false for beta. |

If REDIS_URL is not used: supply REDIS_HOST and numeric REDIS_PORT explicitly, REDIS_PASSWORD when required, and REDIS_TLS=true for verified TLS. URL mode supports provider ACL username/password and preserves its port/database. Never turn off certificate verification. Internal Render connections default to no authentication unless enabled; copy the actual current provider URL.

Frontend provider environment:

| Variable | Requirement |
| --- | --- |
| NEXT_PUBLIC_API_URL | Exact HTTPS backend base ending in /api/v1, supplied BEFORE Docker build and retained at runtime. No credentials, query or fragment. |
| PORT | 3000 or provider assigned port |

Render translates service env variables into Docker build arguments. The frontend Dockerfile declares ARG NEXT_PUBLIC_API_URL, assigns ENV, checks nonempty and then runs npm run build. Next config validates the URL. Runtime-only changes do not replace an embedded client URL: rebuild/redeploy frontend whenever it changes. Docker users must pass --build-arg NEXT_PUBLIC_API_URL with the intended public base. Local verification used an explicitly provided http://localhost:3001/api/v1; there is no production default.

WebSocket uses new URL(API_BASE).origin + /events. No second URL variable is needed. Verify both HTTP polling and WebSocket upgrade work through the deployed proxy. HTTP/Socket.IO origins share the same allowlist; WebSocket middleware also checks Origin, JWT and the existing DB-backed company/property authorization. Requests without Origin still require JWT. /clock does not mount the admin notification subscriber.

## Backend and explicit administrator bootstrap

4. Deploy the backend image with all variables present. Docker CMD is node scripts/startup.cjs: prisma migrate deploy, optional explicitly enabled one-time bootstrap, then node dist/main.js. Migrations must complete successfully against the dedicated beta database before the app starts. No db push, reset, automatic seed or history edits. If deployment fails, diagnose before retrying; do not reset the database.
5. The startup wrapper requires prisma migrate deploy to succeed before continuing and reports a safe migration completion message. No operator shell is required for initialization. For optional read-only troubleshooting, an authenticated operator can run npx --no-install prisma migrate status in the backend image/workdir and check all migration directories, including the new 20260916000100_indexed_kiosk_pin, including 20260909000100_stage1_additive_reconciliation and 20260909000200_stage2_approval_step_fk. The legacy users.pin_code column/index remain deliberately untouched.
6. For the fresh database only, temporarily populate these provider secret variables through its secure UI: BOOTSTRAP_EMAIL, BOOTSTRAP_PASSWORD, BOOTSTRAP_FIRST_NAME, BOOTSTRAP_LAST_NAME, BOOTSTRAP_EMPLOYEE_NUMBER, BOOTSTRAP_COMPANY_NAME, BOOTSTRAP_COMPANY_TAX_ID. Use the real authorized administrator/company identity. Password: at least 16 characters, at most 72 UTF-8 bytes, uppercase, lowercase, number and symbol; common predictable strings are rejected. Use a password manager to generate/store it. Do not put values in shell history, tickets, source or this document.
7. For a shell-free first deploy, set BOOTSTRAP_ADMIN_ON_START=true together with all seven inputs before deploying. The startup wrapper runs the existing bootstrap after migrations and before Nest. Only the exact string true enables it. Successful startup bootstrap records a non-secret audit marker in the same transaction. A retry skips only if exactly one company/user remains, that marker exists, all intended identity/company fields match, and the configured password still matches the stored bcrypt hash. Additional users/companies, missing provenance or mismatches fail closed. Disable/remove the flag and remove the seven BOOTSTRAP_* inputs immediately after confirming login, before adding operational users/companies. Subsequent normal deploys then need no bootstrap inputs. The explicit npm run bootstrap:admin operator command remains available and still refuses a nonempty database; it does not reset passwords. See REMOTE_BOOTSTRAP_REPORT.md for exact dashboard steps.
8. Confirm GET /health returns HTTP 200 with only status:ok. Both PostgreSQL SELECT 1 and Redis PING must succeed. Tests cover separate dependency failures and a timeout returning 503 with a generic message. Render healthCheckPath remains /health. In an isolated pre-pilot environment deliberately interrupt each dependency, confirm non-success, restore it and confirm readiness recovery. Do not interrupt a customer session to test this.

## Frontend and pilot acceptance

9. Deploy/rebuild frontend after setting its exact API base. Verify browser network calls reach the intended beta backend, never local development or another deployment. Confirm allowed-origin CORS success and rejection for an unrelated origin. Verify /admin redirects signed-out users to login, valid bootstrap login works, WORKER cannot enter admin and logout clears the session.
10. Create one real pilot property via /admin/locations using a valid IANA timezone such as the location's actual America/Merida zone. The UI now labels timezone correctly; the server rejects invalid values. Company must be explicit or come from the bootstrap administrator; there is no invented default company.
11. In Employees choose Create Employee. Enter first/last name, EMP- employee number, optional email, initial six-digit PIN and status. Select a real Property, add/select Department and Position, and specify effective dates. Save and verify the server reports Clock Ready. For an existing employee open their details → Add Assignment and select another authorized Property/Department/Position; this never creates a second User. Overlapping active assignments at the same Property are rejected. To revoke clock eligibility, close any open work shift and deactivate its assignment; history is preserved. Communicate PIN through the authorized View PIN action (15-second display) or Reset PIN action. No rates are required or invented.
12. On a dedicated kiosk browser visit /clock/setup, sign in as an authorized administrator, explicitly select/save the property, then sign out. Open /clock and verify its property code/timezone, six-digit PIN protection, successful clock-in/lunch sequence/clock-out, invalid PIN rejection, lockout and 503 when Redis is unavailable. Check a second property's records never appear; after inactivity the prior employee's information clears.
13. On a separate admin browser confirm authorized property selection and real attendance events at /admin and /admin/punches. The table is the most recent 200 raw events, UTC timestamps, employee, property and event type. Network failure shows an error without local/demo fallback. It is not a shift summary, worked-time total or payroll report.
14. Verify no notification socket is opened from /clock. Verify admin sockets require JWT, reject foreign origins/properties, and disconnect on expiry. The current backend has no production alert producer; do not promise live notifications merely because subscription connects.
15. Test throttling from at least two devices/networks and forged forwarding headers in the isolated beta. Current Nest HTTP throttling is per-process and based on req.ip; kiosk account lockout remains Redis-backed by employee credentials across endpoints/properties. Audit IPs are not evidence of verified original client IP until proxy validation is complete.

## Backups and rollback

Before pilot: document owner, retention, recovery point and recovery time expectations; enable provider PostgreSQL backups and Redis persistence; verify a database restore to a separate recovery instance. Keep PIN_ENCRYPTION_KEY recoverable in a separate secure store. Previously documented free-provider assumptions do not establish durability or recoverability and are unsuitable assurances for a multi-day real pilot. Verify the actual selected plan; no current provider backup or retention was verified here.

Before every release: verify a recent recoverable database backup and retain the previous application image/commit and configuration revision. To roll back application code, select the prior compatible backend/frontend release in the dashboard, preserve secrets and database URLs, and rebuild frontend if its public API base differs. Re-run health/admin/clock smoke checks. Do not run migration down/reset/db push or restore over the live database as an application rollback. Database recovery requires a separately reviewed restore plan and maintenance window.

## Known limits for the client

Schedules, example audit/settings, payroll and financial reports are hidden from normal navigation. Direct schedules/settings routes show unavailable; financial reports remain explicitly unavailable. Ordered multi-step approval workflows are integration-tested through the API; a visual workflow designer, rate configuration, geofence, invoicing and final XLSX output are not validated pilot functionality. No invented pay/bill/OT totals are shown. Staff maintenance failure does not fabricate a saved row. Editing with blank PIN preserves the existing PIN. The beta supports multiple operational assignments on one employee, scoped list/history and deactivation. Effective end dates are supplied on creation; editing an existing assignment context/end date is deferred. Deactivate and create a non-overlapping replacement. PIN eligibility still requires an ACTIVE employee and effective EmployeeAssignment.

The current blueprint free plan selection requires operator review. Docker Desktop and local PostgreSQL/Redis were available; actual release container builds and remote deployment remain untested; local builds used Node 24 while Docker specifies Node 20. Existing lockfiles were not changed. The functional audit added the approval policy migration described below and used only local nexustaff_test.

## Sources checked

- [Render Docker environment/build arguments](https://render.com/docs/docker)
- [Render Blueprint generated secrets](https://render.com/docs/blueprint-spec)
- [Render health checks](https://render.com/docs/health-checks)
- [Render Key Value URLs, auth and persistence](https://render.com/docs/key-value)
- [Render free plan limitations](https://render.com/docs/free)
- [Render PostgreSQL backups](https://render.com/docs/postgresql-backups)

The prior tracked JWT secret is potentially compromised. If it was ever deployed, rotate it; beta must use a fresh provider secret. The known historical commit remains; no Git history rewrite was performed. Current source inspection found no additional live JWT/PIN/Redis secret; Compose PostgreSQL defaults and test fixtures are local/test values, never beta credentials.

## Corrective release: separate clock, indexed PIN and full-period exports

Use UX_RECOVERY_CORRECTIVE_REPORT.md for migration and enrollment steps. `/` opens `/clock`; Admin login/navigation has no employee-clock launcher. Settings → Terminal Setup remains the authorized pairing bridge. Reports now downloads complete server-side detail/summary CSV by custom/weekly/biweekly period, independent of the 200-event display window. These exports do not finalize or approve hours. Period approval and correction APIs are now integration-tested; see the current addendum. Never run the PIN backfill automatically on startup; review its count-only dry run against the explicitly named database before authorizing apply.

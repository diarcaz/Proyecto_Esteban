# NexuStaff beta operations — Phase 4.6

Status: prior Phase 4.6 acceptance is historical. Current remote release gates are defined in UX_RECOVERY_CORRECTIVE_REPORT.md: indexed PIN migration/enrollment, real integration/proxy acceptance, and incomplete period approval APIs. Do not treat the current branch as remotely accepted.

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
| JWT_EXPIRATION | Explicit access token lifetime; manifest currently 7d. Choose the pilot session policy intentionally. Refresh lifetime remains 7 days. |
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

Before pilot: document owner, retention, recovery point and recovery time expectations; enable provider PostgreSQL backups and Redis persistence; verify a database restore to a separate recovery instance. Keep PIN_ENCRYPTION_KEY recoverable in a separate secure store. Free Render PostgreSQL lacks managed backups; free Key Value can lose lockouts/session records after restart. These are unsuitable assumptions for a persistent attendance pilot.

Before every release: verify a recent recoverable database backup and retain the previous application image/commit and configuration revision. To roll back application code, select the prior compatible backend/frontend release in the dashboard, preserve secrets and database URLs, and rebuild frontend if its public API base differs. Re-run health/admin/clock smoke checks. Do not run migration down/reset/db push or restore over the live database as an application rollback. Database recovery requires a separately reviewed restore plan and maintenance window.

## Known limits for the client

Schedules, example audit/settings, payroll and financial reports are hidden from normal navigation. Direct schedules/settings routes show unavailable; financial reports remain explicitly unavailable. Advanced approval workflows, rate configuration, geofence, invoicing and final XLSX output are not validated pilot functionality. No invented pay/bill/OT totals are shown. Staff maintenance failure does not fabricate a saved row. Editing with blank PIN preserves the existing PIN. The beta supports multiple operational assignments on one employee, scoped list/history and deactivation. Effective end dates are supplied on creation; editing an existing assignment context/end date is deferred. Deactivate and create a non-overlapping replacement. PIN eligibility still requires an ACTIVE employee and effective EmployeeAssignment.

The current blueprint free plan selection requires operator review. Docker is not installed in this local workspace, so container builds and real Render deployment remain untested; local builds used Node 24 while Docker specifies Node 20. Existing lockfiles were not changed. No Prisma schema or migration was modified. Phase 4.6 only created/cleaned isolated data in local nexustaff_test for regression and browser acceptance.

## Sources checked

- [Render Docker environment/build arguments](https://render.com/docs/docker)
- [Render Blueprint generated secrets](https://render.com/docs/blueprint-spec)
- [Render health checks](https://render.com/docs/health-checks)
- [Render Key Value URLs, auth and persistence](https://render.com/docs/key-value)
- [Render free plan limitations](https://render.com/docs/free)
- [Render PostgreSQL backups](https://render.com/docs/postgresql-backups)

The prior tracked JWT secret is potentially compromised. If it was ever deployed, rotate it; beta must use a fresh provider secret. The known historical commit remains; no Git history rewrite was performed. Current source inspection found no additional live JWT/PIN/Redis secret; Compose PostgreSQL defaults and test fixtures are local/test values, never beta credentials.

## Corrective release: separate clock, indexed PIN and full-period exports

Use UX_RECOVERY_CORRECTIVE_REPORT.md for migration and enrollment steps. `/` opens `/clock`; Admin login/navigation has no employee-clock launcher. Settings → Terminal Setup remains the authorized pairing bridge. Reports now downloads complete server-side detail/summary CSV by custom/weekly/biweekly period, independent of the 200-event display window. These exports do not finalize or approve hours. Period approval APIs remain incomplete. Never run the PIN backfill automatically on startup; review its count-only dry run against the explicitly named database before authorizing apply.

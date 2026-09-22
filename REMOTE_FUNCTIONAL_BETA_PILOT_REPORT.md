# NEXUSTAFF REMOTE FUNCTIONAL BETA PILOT REPORT

Date: 2026-09-22. Result: remote acceptance blocked; local release preparation passed. No application source changes, deployment, remote migration, bootstrap, seed, db push, reset, key rotation, resource purchase or remote data mutation was performed.

## Release checkpoint

- Repository: `github.com/diarcaz/Proyecto_Esteban`, current branch `main`, HEAD `9852ca55` (`beta v.1`).
- Functional Beta Hardening changes remain present in the working tree, including new auth credential validation, corrections UI, Staff status handling, concurrency audit and optional approval policy. They are not represented by HEAD; HEAD must not be labeled the completed hardening release.
- `20260922230000_optional_branch_approval/migration.sql` is present and unchanged: additive NOT NULL boolean `require_approval`, default true. Existing migration history was not edited.
- Backend build: PASS, exit 0.
- Frontend production build: PASS, exit 0, 17 static pages. This build explicitly used `NEXT_PUBLIC_API_URL=https://nexustaff-backend.onrender.com/api/v1`. That proves the local artifact configuration, not the deployed frontend configuration.
- `git diff --check`: PASS. Generated TypeScript metadata was restored to baseline. Existing application changes were preserved.
- No release commit/push was made. Render's actual service, connected branch, deployment mode and previous release must first be identified; a push must not accidentally trigger an unverified deployment.
- Actual backend/frontend release IDs, deployed commit and previous known-good remote release: BLOCKED, not identifiable from available authenticated access. Local baseline commit is not evidence of the current remote release.

## Access and health evidence

Render dashboard redirected to `https://dashboard.render.com/login` and displayed Sign In. No authenticated Render browser session was available. No Render CLI, GitHub CLI, RENDER_API_KEY or GitHub token was available in the inspected command environment. No secret values were printed or requested in chat. A dashboard tab was left for user sign-in and access was requested.

The public backend `/health` could not be verified: web retrieval was unavailable, the authorized direct HTTPS request timed out, and browser navigation reported ERR_BLOCKED_BY_CLIENT. These are access/transport observations, **not proof that Render or its PostgreSQL/Redis services are unhealthy**. No HTTP 200/dependency health is claimed.

The existing beta SUPER_ADMIN was not accessed because an authorized authenticated beta session or credential handoff was not available. No password was changed or exposed. Old-session rejection after credential-version deployment remains expected, but has not been tested remotely here.

## Migration and environment

The local startup wrapper still executes migration deploy before optional bootstrap and Nest. Remote migration execution/status and the new column remain unverified. Local migration success from the prior phase is not substituted for remote evidence.

Remote presence/value correctness is BLOCKED for NODE_ENV, DATABASE_URL, REDIS_URL, JWT_SECRET, PIN_ENCRYPTION_KEY, PIN_LOOKUP_KEY, CORS_ORIGIN and frontend NEXT_PUBLIC_API_URL. The independent/stable PIN keys were not read, changed or rotated. BOOTSTRAP_ADMIN_ON_START must stay absent/false and one-time BOOTSTRAP_* inputs removed for the initialized beta; remote state was not assumed from the repository template.

## Remote acceptance questions

| # | Question | Result / evidence |
| --- | --- | --- |
| 1 | New migration applied safely? | **BLOCKED** — candidate SQL verified locally; no remote deploy/status access |
| 2 | Backend/frontend/health connected to intended beta? | **BLOCKED** — local frontend build targets intended backend; no verified remote health/release |
| 3 | Accounts created/managed without SQL? | **BLOCKED** — no remote authenticated application acceptance performed |
| 4 | Removed Branch denied on next request? | **BLOCKED** — no remote existing-token/grant-removal test |
| 5 | Staff created and Clock Ready without SQL? | **BLOCKED** — no remote disposable Staff created |
| 6 | Remote canonical Clock sequence? | **BLOCKED** — no remote paired-terminal acceptance |
| 7 | Concurrent terminal actions serialized? | **BLOCKED** — no remote race or rejection-audit inspection |
| 8 | Missed exit corrected with raw evidence intact? | **BLOCKED** — no remote correction/evidence comparison |
| 9 | Required approval/reapproval? | **BLOCKED** — no remote persisted workflow verification |
| 10 | Optional approval? | **BLOCKED** — no remote OFF/reload/NOT_REQUIRED verification |
| 11 | Corrected authoritative CSV? | **BLOCKED** — no remote controlled exports inspected |
| 12 | CORS/socket authorization? | **BLOCKED** — actual frontend origin and authenticated socket unavailable |
| 13 | Proxy/IP/rate limits acceptable? | **BLOCKED — P1** — no verified Render topology or independent-network test evidence |
| 14 | PostgreSQL backup/recovery sufficient? | **BLOCKED — P1** — actual plan, retention and restore capability inaccessible |
| 15 | Redis appropriate for pilot scope? | **BLOCKED — P1** — actual persistence, availability and outage behavior inaccessible |

Prior local PASS results remain valid in FUNCTIONAL_BETA_HARDENING_REPORT.md. They are deliberately not promoted to remote PASS. No remote disposable fixtures exist from this attempt, so no remote cleanup or policy restoration was needed.

## Proxy and durability stop gates

Per section 12 of the request, stop instead of guessing when remote req.ip/topology and independent-client behavior cannot be proven safely. This environment has not supplied two independent real networks or authenticated provider diagnostics. No trust-proxy change was made.

The repository's free-plan template does not establish the actual purchased/configured plans. PostgreSQL backup availability/retention/expiration, Redis persistence/expiration and recovery options are all unverified. Do not infer current provider capabilities from the template or local restart tests. No resource was purchased, upgraded or provisioned.

## Restore drill plan

1. In the authenticated provider dashboard, identify the exact beta DB/service and plan, storage persistence, expiration, backup schedule/retention and recovery permissions. Record non-secret resource/release identities.
2. Assign backup/recovery ownership and agree retention, RPO and RTO. Verify independent recovery copies of stable PIN encryption and lookup keys and other required configuration.
3. Select an existing verified backup. Confirm that a **separate** recovery instance can be created safely, including any cost approval, before provisioning. Never select the live beta as restore target.
4. Restore only into that recovery environment. Verify migration state, Company/Branch/Staff/assignment counts, raw and effective attendance, corrections, approvals and controlled PIN operation without exporting secrets or client records into the report.
5. Record backup age, restore duration, successful checks and any gaps. Confirm who can repeat recovery. Keep the live beta untouched. Local graceful restart tests are not this drill.

## Release/rollback continuation

After authenticated access is available, identify service IDs, connected repository/branch, current backend/frontend release commits and previous known-good images. Capture the approved working tree as the candidate release commit. Verify existing initialization and environment before triggering the authorized deployment. Use existing startup migrate deploy, inspect successful migration/Nest logs and migration status, then execute the requested disposable application acceptance.

Preserve previous release identifiers and a recoverable backup. Roll back only to schema/policy-compatible application versions; no migration down, database reset or live-data restore. A prior application that ignores approval-OFF configuration is not compatible with operational use of those Branches. Preserve stable secrets and database connections.

## Findings and remaining limitations

- **P0:** No concrete remote P0 demonstrated; lack of access is not proof of a data-loss or exposure incident.
- **P1 MUST FIX BEFORE REAL PILOT DATA:** authenticated provider/application access and exact release/migration/env/health evidence; unperformed remote application isolation/lifecycle acceptance; unverified independent-client proxy/rate-limit behavior; unverified PostgreSQL recoverability and Redis durability/outage policy. Failure scenarios include deploying the wrong source/target, accepting attendance into an unrecoverable service, shared/spoofable throttle identity and remote-only authorization/runtime defects going undetected.
- **P2:** Existing controlled functional limitations remain documented in the local report; none are newly validated remotely.
- **P3:** No future development was undertaken.

Remote defects found/fixed: none proven, none modified. Only this report was added during this release attempt; builds generated ignored artifacts. The task cannot authorize collection of real attendance on local evidence alone.

NOT READY TO COLLECT CONTROLLED CLIENT BETA DATA

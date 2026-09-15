# NEXUSTAFF REMOTE BETA ONE-TIME ADMIN BOOTSTRAP REPORT

## 1. Files modified

- `backend/scripts/startup.cjs` (new): ordered container startup, exact opt-in flag, safe error handling and child-process management.
- `backend/scripts/bootstrap-admin.cjs`: reuses the existing initial administrator creation logic; adds safe missing-variable diagnostics and strictly verified startup retry support.
- `backend/scripts/startup.test.cjs` (new): focused startup, security and retry tests.
- `backend/Dockerfile`: container CMD now invokes the Node startup wrapper.
- `BETA_OPERATIONS.md`: documents optional startup bootstrap and removal of temporary variables.
- `REMOTE_BOOTSTRAP_REPORT.md` (new): implementation, validation and deployment instructions.

No Prisma schema, migration, package dependency or Render Blueprint changes.

## 2. Startup flow

`node scripts/startup.cjs` runs the installed Prisma CLI with `migrate deploy`. Only after success, when `BOOTSTRAP_ADMIN_ON_START` is exactly the string `true`, it calls the existing bootstrap implementation. Only successful creation or a verified skip allows `node dist/main.js` to start.

Absent, `false`, uppercase `TRUE` and other values do not enable bootstrap. Migration, bootstrap or application-process failures cause a nonzero exit. The wrapper forwards termination signals to its running child. The normal migration-then-Nest flow is retained when the flag is disabled; the existing npm production command is unchanged.

## 3. Security behavior

Fresh initialization still requires no users or companies and rejects account/admin conflicts. The existing transaction-scoped PostgreSQL advisory lock serializes cooperating bootstrap attempts. Company, ACTIVE SUPER_ADMIN and the new non-secret audit marker are written in one transaction. Failure rolls everything back.

Password hashing remains bcrypt with cost 12. Existing rules remain: at least 16 characters, no more than 72 UTF-8 bytes, uppercase, lowercase, digit and symbol, plus the existing predictable-string rejection. No password, PIN, hash, key or connection string is added to source or output. Missing-input errors name only the variable. Other failures are sanitized; migration subprocess output is suppressed and replaced with a safe stage message. Bootstrap variables are excluded from the migration and Nest child environments.

No reset, db push, automatic password overwrite, deletion or migration-history edit was introduced. The explicit manual bootstrap command retains its refusal to initialize a nonempty database.

## 4. Idempotency behavior

A startup retry skips only when all of these hold:

- Exactly one user and one company exist.
- The user has the matching versioned `INITIAL_ADMIN_BOOTSTRAPPED` audit marker, recorded atomically by a prior startup bootstrap and tied to the user/company IDs.
- Role, job-position code and active status match the initial SUPER_ADMIN.
- Normalized email, employee number, names, company name and tax ID match the configured inputs.
- The supplied password verifies against the existing bcrypt hash.

It prints `Initial administrator already exists; bootstrap skipped.` and leaves the existing account and password hash unchanged. Missing provenance, a changed identity/password, extra users/companies or other mismatches fail closed. A manually created administrator without this marker is not silently adopted. All required inputs remain required while the flag is true, including for a retry.

Disable the flag and remove temporary inputs after confirming initial login, before creating operational accounts or companies. Repeat deployment of an operational database then follows the normal startup path.

## 5. Required Render variables

Temporary variables for the initial startup:

| Variable | Value to supply |
| --- | --- |
| BOOTSTRAP_ADMIN_ON_START | Exactly `true` |
| BOOTSTRAP_EMAIL | Authorized administrator email |
| BOOTSTRAP_PASSWORD | Unique password meeting the existing rules; store in a password manager |
| BOOTSTRAP_FIRST_NAME | Administrator first name |
| BOOTSTRAP_LAST_NAME | Administrator last name |
| BOOTSTRAP_EMPLOYEE_NUMBER | Intended unique employee number |
| BOOTSTRAP_COMPANY_NAME | Intended company name |
| BOOTSTRAP_COMPANY_TAX_ID | Intended company tax ID |

Missing or whitespace-only required inputs fail safely. There are no default credentials.

Normal backend prerequisites remain `NODE_ENV=production`, the configured `PORT`, dedicated beta `DATABASE_URL`, `REDIS_URL`, strong `JWT_SECRET`, stable `PIN_ENCRYPTION_KEY`, and the real HTTPS frontend `CORS_ORIGIN`. Retain the chosen `JWT_EXPIRATION`. The frontend needs its actual HTTPS backend URL ending in `/api/v1` as `NEXT_PUBLIC_API_URL` before its build. Follow the existing operations guide for these values; none are printed here.

## 6. Tests

Executed from `backend`:

```text
node --test scripts/startup.test.cjs scripts/beta-readiness.test.cjs scripts/phase47b.test.cjs scripts/phase47c.test.cjs
```

Result: **42 passed, 0 failed**, including 20 new startup tests. Coverage includes absent/false/non-exact flags, each missing input, creation of SUPER_ADMIN, bcrypt storage, safe logs, unchanged hash on retry, missing marker, unexpected data and identity mismatches, simulated transaction rollback, migration failure, normal application dispatch, exclusion of bootstrap variables from children and real Node subprocess success/failure.

Database behavior was tested with transactional fixtures; these tests are not evidence of a new live PostgreSQL initialization or a Render/container deployment. No existing local administrator was created, changed or reset during this task.

## 7. Build/typecheck

- `npm run build`: passed. The installed npm CLI under Program Files was invoked through Node because the user-level npm launcher was broken.
- `node node_modules/typescript/bin/tsc --noEmit`: passed.
- `git diff --check`: passed.

## 8. Prisma validation

`node node_modules/prisma/build/index.js validate`: passed against the current schema. Prisma schema and migration diffs are empty. No migration was created or applied by this implementation/validation task.

## 9. Exact Render deployment steps

1. Publish the reviewed source changes through your normal repository/release process. This task has not pushed or deployed them. Select that revision for the dedicated beta backend service. Use Docker runtime with the existing Blueprint configuration: context `./backend`, Dockerfile `./backend/Dockerfile`, health check `/health`.
2. In the backend service settings, leave **Docker Command** unset so the image CMD runs `node scripts/startup.cjs`. Remove any old override that bypasses the wrapper. Render documents that Docker Command overrides Dockerfile CMD. [Render Docker documentation](https://render.com/docs/docker)
3. Confirm the service points to the intended dedicated beta PostgreSQL database, with no existing users or companies, and its intended Redis service. Supply the normal backend variables listed above. Do not point initial bootstrap at the populated local test database or an unrelated existing deployment.
4. In the backend service dashboard, open **Environment**, use **Add Environment Variable**, and enter the flag plus all seven temporary inputs together. Use the secure dashboard and password manager; do not put credentials in the repository or deployment commands. Choose **Save only** if preparing configuration before the selected source is ready, then deploy that revision; otherwise use **Save, rebuild, and deploy** after the source is available. Render documents these environment-save choices. [Render environment configuration](https://render.com/docs/configure-environment-variables)
5. Watch deployment logs for `Database migrations completed.` followed by `Initial administrator created. Disable startup bootstrap and remove BOOTSTRAP_* variables.` Nest then starts. An immediate retry with the unchanged initialized state may instead show the verified skip message. A failure stops startup; check the named missing variable or the intended configuration/state without deleting data or resetting a password.
6. Confirm the backend `/health` responds successfully. Configure/build the frontend with the real backend API URL and confirm login with the administrator credentials stored in your password manager.
7. Immediately after that login, return to backend **Environment**. Set `BOOTSTRAP_ADMIN_ON_START=false` or remove it, and remove all seven temporary bootstrap inputs in the same configuration update. Keep database, Redis, JWT and PIN-encryption configuration intact. Save and deploy. Confirm health and login again. Only then add operational employees/companies.
8. Future deploys need no bootstrap variables or operator shell. Keep the flag disabled. A fail-closed bootstrap on a nonempty database requires inspecting whether initialization actually completed; do not automatically erase data, change credentials or manufacture an audit marker.

These steps prepare and initialize the first administrator. Existing remote smoke acceptance, proxy validation and backup requirements in `BETA_OPERATIONS.md` remain separate beta readiness checks.

## 10. Verdict

**READY FOR ONE-TIME REMOTE ADMIN BOOTSTRAP, with local code/test validation complete.** The optional path is fail closed, creates the initial records atomically and permits only a verified unchanged initialization to skip on retry. No remote deployment or live database bootstrap was performed. No Phase 5 work was started.

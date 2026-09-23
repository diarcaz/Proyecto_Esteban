# NEXUSTAFF REQUIRE APPROVAL DEPLOYMENT CHECK

## 1. Exact UI location

Inspected HEAD `af1f47b42f1b367195eb0d4a221ceae73f7709b1` (`beta v.1.1`), not the previous report's uncommitted baseline. In that commit, `frontend/src/components/reports/period-review.tsx` renders the checkbox in **Time Reports → Period review & approval**, inside `{review && ...}`. It appears only after **Open period** successfully resolves/loads a period, or an existing period is selected. Selecting Miami alone does not reveal it. Branch Locations → Edit has no such control in this implementation.

## 2. Visibility conditions

HEAD requires a specific Branch rather than ALL, TIME_VIEW for the review section, role SUPER_ADMIN/OWNER/ADMIN and PROPERTY_MANAGE for the checkbox, plus a loaded review. A failed period request also leaves it hidden. The new working-tree adjustment removes only the loaded-period prerequisite: selecting a specific Branch loads its actual policy directly, before Open period. Role/capability restrictions remain.

## 3. SUPER_ADMIN

Yes: SUPER_ADMIN passes both UI capability checks and backend company-admin policy checks. In HEAD it should see the checkbox **after** opening a period. OWNER for its own company and ADMIN with the required Branch capabilities can configure it. Backend resolves Company/Property independently; UI visibility is not authorization.

## 4. Committed/release content

| Question | Answer |
| --- | --- |
| A. requireApproval UI in HEAD? | YES — existing checkbox and policy POST call |
| B. Migration in HEAD? | YES — `20260922230000_optional_branch_approval` |
| C. Backend read/write in HEAD? | YES — period review returns requireApproval; policy POST persists it |

Initial `git status` and diff were clean. No original hardening changes were left uncommitted. Local `origin/main` and HEAD both point to `af1f47b42f1b367195eb0d4a221ceae73f7709b1`; that is local tracking evidence, not a fresh GitHub or Render inspection. Actual deployed backend/frontend commit was not inspected, as requested. The new UX fix below is now uncommitted and is not in that HEAD.

## 5. Migration consistency

HEAD and current tree contain:

```prisma
requireApproval Boolean @default(true) @map("require_approval")
```

Existing migration SQL adds `property_operational_configs.require_approval BOOLEAN NOT NULL DEFAULT true`. No schema/migration/history changes were made in this check. Remote migration status is UNKNOWN; no remote database connection or Render dashboard was accessed.

## 6. Backend and persistence

- Existing read: `GET /api/v1/period-approvals/:periodId` → `PeriodApprovalService.review` → PropertyOperationalConfig, default true if no config record exists.
- Existing write, unchanged: `POST /api/v1/period-approvals/policy/:locationId` with `{ "requireApproval": false }` or true → `setApprovalPolicy` → transactional config upsert, review invalidation and audit. Authorization requires persisted PROPERTY_MANAGE context and SUPER_ADMIN/OWNER/ADMIN.
- Minimal new read: `GET /api/v1/period-approvals/policy/:locationId` → `getApprovalPolicy`, with the same configuration role/permission restrictions. This avoids creating/opening a period merely to read a Branch setting; no writes occur on read.
- Frontend `periodApprovalApi.getPolicy` calls that read; existing `policy` performs the write. New `BranchApprovalPolicy` shows the returned boolean, saves through the canonical POST, re-reads and refreshes any open review. Loading/saving disables input; failed reads/saves show an error and reload action without claiming a saved value. Remount reads persisted state. Auth/Branch-scoped mounting discards stale component updates.

## 7. Diagnosis

**A confirmed:** conditional UI explains absence before Open period, even on the correct release. This is a discoverability defect for ordinary Branch configuration; the small fix removes the period dependency.

**B not confirmed:** the original UI is present in source. **C ruled out for the starting tree:** original hardening is committed. **D unknown:** stale/incorrect deployment cannot be concluded without release evidence. **E unknown:** remote migration remains unverified. If the HEAD checkbox is absent even after successful period opening as SUPER_ADMIN, compare the actual deployed commit and review API response before attributing it to a database problem.

## 8. Files changed in this check

- `frontend/src/components/reports/period-review.tsx`
- New `frontend/src/components/reports/branch-approval-policy.tsx`
- `frontend/src/lib/api-client.ts`
- `frontend/tests/period-review.test.cjs`
- New `frontend/tests/branch-approval-policy.test.cjs`
- `backend/src/adapters/controllers/period-approval.controller.ts`
- `backend/src/application/services/period-approval.service.ts`
- New `backend/scripts/approval-policy-read.test.cjs`
- This report.

No Branch Locations redesign, schema change, remote data modification, push or deployment. Generated TypeScript metadata restored to HEAD.

## 9. Validation

- Frontend focused review/policy/correction tests: **13/13 PASS**. Includes no-period visibility, persisted read/save/remount, loading/error/retry, rejected save and stale updates.
- Backend policy-read tests: **3/3 PASS**. Default/persisted value, authorized company admin, foreign/insufficient-role/capability rejection. Existing canonical write logic unchanged.
- Backend and frontend `tsc --noEmit`: **PASS**.
- Frontend production build targeting `https://nexustaff-backend.onrender.com/api/v1`: **PASS**, all 17 pages. Non-fatal Windows webpack cache warning only.
- `git diff --check`: **PASS**. Prisma schema and migration unchanged, so Prisma validation was not required for this adjustment. Remote persistence was not retested or claimed.

## 10. Exact next operator actions

First review/commit this fix. In a separately authorized deployment step, publish and deploy **both backend and frontend from that same new commit**: the new frontend needs the new policy GET endpoint. Keep bootstrap absent/disabled and retain stable keys. No push/deploy was executed here.

In Render Shell for the existing backend service, from its backend application working directory, run only:

```sh
npx --no-install prisma migrate status
```

Expected: the release's migration directories are found (nine for the currently inspected repository), no pending/failed/diverged migration state, exit 0 and **Database schema is up to date!**. In particular `20260922230000_optional_branch_approval` must not be pending. Status checks migration history, not an independent proof of physical-column integrity. If it is listed as pending or a failure is reported, preserve the output without credentials and diagnose the release/startup migration logs; use the existing authorized migrate-deploy startup, never db push/reset/seed/bootstrap or manual SQL workaround.

Then compare deployed commit IDs, freshly sign in if needed, select Miami without opening a period, and confirm the policy GET returns a boolean and the control displays it. Test a save/reload only on an authorized disposable Branch or explicitly approved safe configuration window; changing policy invalidates final reviews. Do not toggle real client policy merely to diagnose visibility.

SOURCE FIXED — COMMIT BEFORE REDEPLOY

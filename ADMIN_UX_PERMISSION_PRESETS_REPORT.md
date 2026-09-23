# NEXUSTAFF ADMIN UX & PERMISSION PRESETS REPORT

Date: 2026-09-22. Baseline: `42387164` (`beta v2`), clean working tree at start.

## Files changed

- `frontend/src/app/admin/(protected)/access/page.tsx`: password visibility/checklist, role choices and branch presets.
- `frontend/src/lib/admin-account-ux.ts`: pure recommendation intersection and composition hints (new).
- `frontend/src/components/reports/period-review.tsx`: button hierarchy, async feedback and busy guard.
- `frontend/src/app/globals.css`: Admin-scoped secondary button theme styling.
- `frontend/tests/admin-accounts.test.cjs`: password/preset component and helper regression coverage.
- `frontend/tests/period-review.test.cjs`: button/loading/handler regression coverage.
- `backend/src/application/services/admin-accounts.service.ts`: safe structured predictable-password rejection.
- `backend/scripts/admin-accounts.test.cjs`: error-contract regression.
- This report, `ADMIN_UX_PERMISSION_PRESETS_REPORT.md`.

## Time Reports

Save approval workflow and Refresh review are secondary bordered buttons with theme-aware backgrounds and hover states. Submit period uses the existing primary style. Native disabled states, shared pending state, visible keyboard focus and loading labels are present. The busy guard prevents new actions during an in-flight request. Existing configure/review/submit payloads and submission rules are preserved. Open period retains its existing behavior and styling. Backend approval logic is unchanged.

## Password UX

Create and reset share the hidden-by-default temporary input and accessible Show password / Hide password button with eye icons and pressed state. The button sits immediately below the field, avoiding text overlap at narrow widths. Only currently typed text is revealed. No credential persistence, clipboard action, URL serialization or logging was added. Submission clears the credential before awaiting the API, including failure; cancel, account/session context changes, company and role changes clear and hide it. Existing-account edit never sends password fields.

The checklist mirrors the actual composition checks: length of at least 16 using the existing JavaScript length semantics, ASCII upper/lowercase, digit, non-alphanumeric symbol and maximum 72 UTF-8 bytes. It is advisory. Common/predictable detection remains server-only; the UI explicitly says passing composition does not guarantee acceptance.

The server now responds to a composition-valid but predictable password with HTTP 400 and `{ code: 'PASSWORD_PREDICTABLE', message: 'Password rejected. Avoid common passwords and predictable sequences.' }`. Existing API message handling renders the safe message. The blacklist is not enumerated in the UI. Composition failures retain their safe message.

**No backend security rule changed.** The accepted/rejected password set, bcrypt processing, roles, delegation restrictions, account protections, authentication and credential generation are unchanged. Only the error contract distinguishes an existing rejection reason.

## Exact recommendations and delegation boundaries

| Target role | Recommended permission names, before intersection |
| --- | --- |
| SUPERVISOR | STAFF_VIEW, TIME_VIEW, TIME_APPROVE, PROPERTY_VIEW |
| LOCATION_ADMIN | Supervisor set + STAFF_CREATE, STAFF_EDIT, STAFF_DELETE, TIME_EDIT |
| MANAGER | Same operational set as LOCATION_ADMIN |
| ADMIN | Manager set + PROPERTY_MANAGE |
| OWNER | No generated branch permissions; existing implicit company scope retained |
| SUPER_ADMIN / WORKER / unknown | None; no new creation path |

The helper requires the target role in `catalog.roles`, the exact branch in the selected company, and the branch's create/edit capability appropriate to the form. Each suggested permission must be in both `catalog.permissionNames` and that branch's delegable `permissions`. No branches are auto-selected. Server canonical save validation remains authoritative, including stale catalogs and concurrent changes.

Financial permissions (VIEW_PAY_RATE, VIEW_BILL_RATE, VIEW_MARKUP, VIEW_PAYROLL, VIEW_INVOICES), PIN permissions and MANAGERS_* account-management permissions are never recommended automatically. They remain explicit manual choices when the server permits delegation. This does not reduce OWNER's existing implicit scope, which the form explains.

For new accounts, selecting a branch or changing role calculates recommendations for selected branches; manual overrides remain available. Existing account role changes preserve selections until Apply recommended permissions or Keep current permissions is chosen. Applying a recommendation that removes selections requires a second visible confirmation. Per-branch Use recommended permissions changes only that branch's unsaved selections. No recommendation action calls a save API.

## Accessibility and local browser evidence

Used the existing synthetic local acceptance accounts and `nexustaff_test`, with backend at localhost:3101 and frontend at localhost:3100. No remote services/accounts/data were accessed. No acceptance fixtures were recreated and no admin-account changes were submitted.

- Desktop 1280, tablet 820 and mobile 390 layouts inspected in the local browser; light and dark controls checked.
- New-account branch selection visibly selected operational recommendations while financial/PIN/account-management boxes stayed unchecked.
- Show/Hide toggled a synthetic unsaved preview; keyboard Enter worked, and the focused button had a visible 3px outline. Cancel followed by opening reset produced a blank, hidden input.
- Password controls did not overlap text. Permission/checklist layouts wrapped; document width equaled viewport width at 390 and 820. Existing tables retain internal horizontal scrolling.
- Time Reports loaded an existing closed period without creating one. Refresh succeeded; Save approval workflow appeared secondary and Submit period stayed visibly disabled for the persisted approved data. Light/dark and narrow layouts were inspected. No workflow save or period submission was made.
- Session signed out, temporary browser tab closed, viewport restored. Admin theme CSS remains scoped; Clock regression tests passed and Clock source was untouched.

## Validation

| Check | Result |
| --- | --- |
| Focused frontend: admin-accounts + period-review | 21/21 PASS |
| Full frontend: `node --test tests/*.test.cjs` | 90/90 PASS |
| Frontend `tsc --noEmit` | PASS |
| Frontend production build | PASS; all 17 static pages generated |
| Backend `node scripts/admin-accounts.test.cjs` | 5/5 PASS |
| Backend `tsc --noEmit` | PASS |
| Backend production build | PASS |
| `git diff --check` | PASS |

Tests exercise new/create and reset visibility/clearing, safe server rejection, valid canonical password acceptance, UTF-8 limits, catalog intersections for the listed actor scenarios, financial exclusion, new-role defaults, existing-role Keep/Apply confirmation, no preset auto-save, protected account controls and existing workflow payload/rule regressions. Actor scenarios use synthetic server-catalog shapes; this pass does not claim a fresh database integration run for every role. Existing security implementation was inspected and preserved. Broad DB suites were intentionally not repeated.

Build emitted a non-fatal webpack cache snapshot warning and npm's existing allow-scripts configuration warning. Compilation, type checks and builds completed successfully.

## Remaining UX limitations

- Common/predictable acceptance is only known after server validation; checklist completion is intentionally not an acceptance promise.
- Existing wide tables scroll internally on phones; no sidebar/table redesign was attempted.
- Presets are conservative suggestions, not policy. Existing role changes require explicit choice and Save; there is no hidden auto-save.
- Forced first-login password change is not implemented. Current UI continues to state this explicitly.

## FORCED FIRST-LOGIN PASSWORD CHANGE DESIGN — NOT IMPLEMENTED

**Schema proposal.** Add an additive `User.passwordChangeRequired Boolean @default(false) @map("password_change_required")`. Existing users stay unaffected; do not backfill passwords or reset existing accounts. A separate expiry timestamp is an optional future policy decision, not necessary for the minimum feature.

**Backend/auth flow.** Extend the authorized create/reset input in AdminAccountsController/AdminAccountsService with an explicit temporary-password option (default-on for the intended new-account flow; selectable on allowed resets). Set password hash, required flag and audit record atomically under existing authorization and concurrency rules. Reuse `validateAdminPassword` and canonical bcrypt handling.

Affected auth locations are `infrastructure/auth/auth.service.ts`, `jwt.strategy.ts`, `credential-version.ts`, AuthController/DTOs, JwtAuthGuard and authenticated socket handling. After a correct temporary-password login, return a short-lived token with a distinct password-change-only purpose. Do not issue normal Admin access/refresh credentials yet. Every normal server entry point must reject both the restricted token and a database user whose flag is true; UI redirection alone is insufficient.

Add an authenticated self-service password-change endpoint limited to that purpose and identity. Validate the new password with the canonical validator, reject reuse of the temporary password, and atomically compare/lock the expected credential generation, replace the hash, clear the flag and append the audit event. Parallel completions must yield exactly one winner. Preserve ACTIVE status, role and company checks. Failure must leave the flag set.

**Frontend.** Add `/admin/change-password` outside normal administrative functionality with new-password/confirmation fields, the shared requirements and visibility UX, safe errors and clearing. Login routes the restricted challenge there. Normal route guards and APIs enforce the server state independently. Do not persist the temporary password; prefer an in-memory challenge. Reload/expiry may require signing in again.

**JWT/session behavior.** Current access/refresh credentials already carry the HMAC credentialVersion derived from the password hash, with database rehydration; access lasts 15 minutes, refresh 7 days. Preserve this design. A hash replacement invalidates old credential versions, including restricted tokens. Normal refresh must reject users flagged for change and password-change-purpose tokens. Only issue ordinary credentials after the transaction commits. Reuse atomic Redis refresh rotation; if post-commit issuance fails, require login with the new password instead of undoing the password change. Also test existing authenticated HTTP and socket sessions after an admin-issued reset.

**Audit.** Record actor/target IDs, company scope, temporary requirement set/cleared, time and success/controlled conflict. Never record passwords, hashes, tokens or credential-version material. Follow the current transactional audit pattern for successful changes.

**Migration/rollout.** Apply an additive false-default column first; deploy enforcement on all API/socket replicas before enabling issuance of temporary-required accounts. Feature-gate issuance until full enforcement is live. No existing-user credential backfill is needed.

**Rollback.** Disabling new temporary issuance is safe; reverting to an old backend that ignores true flags is not. Retain enforcement or temporarily deny affected account login while rolling back. Keep the additive column and history; do not clear flags wholesale or destructively drop the column. Use an explicitly reviewed recovery procedure for any stuck account.

**Required future tests.** Real PostgreSQL transaction/concurrency tests; required and optional create/reset paths; valid/weak/predictable/over-byte/reused passwords; restricted-token purpose enforcement on every Admin route and socket; old access/refresh rejection; normal refresh rejection while flagged; cross-account attempts; deactivation during challenge; two concurrent completions; audit redaction/atomicity; challenge expiry/replay; frontend bypass attempts; issuance failure after commit; rollout/rollback with existing true flags.

**Risk assessment.** This future feature changes authentication and requires its own security/integration acceptance. Main risks are unrestricted token issuance before completion, mixed-version replicas ignoring the flag, refresh/socket bypass, replay/concurrent completion and unsafe rollback. None of its schema, endpoint, token or UI changes were implemented in this UX pass.

No commit, push, deploy, Render access, schema/migration change, secret change or bootstrap enablement was performed.

READY TO COMMIT ADMIN UX POLISH

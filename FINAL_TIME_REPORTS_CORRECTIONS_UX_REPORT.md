# NEXUSTAFF FINAL TIME REPORTS & CORRECTIONS UX REPORT

## Baseline and scope

Baseline commit: `f9081550444b605c9fb7a99a04daa5f70fdb7c57` — `harden login lockout and correction history retention`. Initial working tree was clean. Inspected Staff onboarding, Additional Assignment, correction services/controller, period review/history, and the Blob-based export path before changing them.

Ten existing migrations were present, ending with `20260924000100_restrict_correction_history`. No schema or migration was modified or created. The correction-retention migration remains byte-for-byte unchanged. No backend application source changed. No push, deployment, production access, database reset, db push, bootstrap or secret rotation was performed.

## Changes and verified behavior

### Branch catalog and assignments

Existing Branch catalog loading, Department-to-Position filtering, stale-response protection and permission-aware inline creation were retained. Empty Department/Position messages now explicitly explain when the actor lacks creation permission and direct them to their Company Administrator. Actors with PROPERTY_MANAGE retain the existing Add Department / Add Position controls. STAFF_CREATE does not grant PROPERTY_MANAGE.

The existing server overlap rejection is mapped to a message naming the already-authorized catalog Branch: “This Staff member already has an overlapping assignment at Florida Beach. To change Department, Position or assignment dates, end or deactivate the current assignment first.” The error is persistent beside the form; no internal IDs or unauthorized assignment details are added. Changing Branch clears stale selections and feedback. The overlap validation itself is untouched.

### Approve and Reject confirmations

Pending corrections expose distinct, spaced native buttons. Neither button executes a review request directly. A modal shows Staff, correction type, proposed verified time in Branch time, reason and impact; the existing API is called only after explicit confirmation.

Cancel receives initial focus. Enter on Cancel cancels; Escape cancels without mutation. Native modal behavior traps focus. Cancellation returns focus to the opener; if a successful action removes that opener, focus falls back to the Time corrections summary. A synchronous ref lock prevents duplicate submissions before React rerenders. Controls show saving/disabled state while the operation is pending. Reject uses existing reviewer comments and requires nonempty comments at confirmation; no new rejection workflow exists.

Successful actions show “Correction approved.”, “Correction rejected.” or “Correction request created.” A successful mutation followed by a failed refresh is explicitly reported as saved with a refresh problem, rather than incorrectly reported as a failed mutation.

### Approved corrections and invalid ranges

Approved corrections have no Approve/Reject/direct-edit controls and explain that they are immutable attendance audit history. Source inspection and a real PostgreSQL regression confirm that subsequent correction requests are supported. “Create another correction” selects the existing shift in the existing form when that shift is present in the currently reviewed period; it never changes the old request and leaves time/reason blank. For shifts outside the current period, explanatory text directs the operator to the relevant shift and period.

Known invalid-range messages are mapped to safe Clock In/Clock Out guidance according to correction direction, including equality as invalid. Other known assignment, overlap and break conflicts receive controlled wording. Arbitrary backend messages, Prisma details and enum names are not rendered as error text. A failed review reloads authoritative request status before claiming it remains Pending. A confirmed Pending request stays rejectable. If status cannot be refreshed after a network failure, the UI honestly warns that the action may have completed and asks for refresh.

No optional effective-time comparison panel was added: displayed proposed time and directional validation guidance are sufficient for this scoped pass, without presenting potentially stale shift totals as current authoritative evidence.

### Branch-local presentation

The existing period review response already contains the persisted Branch IANA timezone. It is passed to TimeCorrections and ReviewHistory, avoiding a new API or a device-timezone guess. Correction table, confirmation and shift labels use that timezone, with Branch name/timezone shown. Stored UTC remains unchanged and is available in title attributes. Missing timezone falls back explicitly to UTC. The entry form retains its accepted “your device timezone” semantics.

### History investigation

Root cause: the service returns `history: []` before submission, and the previous frontend simply mapped that array inside details, leaving an expanded blank area. Existing records were already returned by the service; no missing-history backend query defect was found.

ReviewHistory now shows “No review history yet.” or actual persisted events, sorted chronologically without mutating the input. Entries show actor, time, step, readable status transition and notes. Native details/summary preserves keyboard and expand/collapse behavior. No fake events or internal IDs are shown.

### CSV filenames

The frontend already owns filenames through its Blob download anchor. That single path now uses:

- `NexuStaff_Florida-Beach_Attendance-Detail_2026-09-22_2026-09-23.csv`
- `NexuStaff_Florida-Beach_Period-Summary_2026-09-22_2026-09-23.csv`

Branch names come from the authorized location store. Unicode letters/numbers remain readable; unsafe characters, dots/path separators, controls and whitespace become safe hyphen separators. Components are bounded and cannot be empty. Aggregate exports use All-Authorized-Branches. An unavailable single-Branch label uses Selected-Branch rather than inventing a name. Weekly/biweekly ranges use inclusive 7/14 calendar days in UTC date arithmetic; custom dates retain the selected range.

CSV generation, content, query parameters and authorization are unchanged. The returned Blob is passed directly to the download URL; tests assert object identity and unchanged bytes.

## Files changed

- `frontend/src/app/admin/(protected)/employees/page.tsx`
- `frontend/src/lib/staff-ux.ts`
- `frontend/src/components/reports/time-corrections.tsx`
- `frontend/src/lib/correction-ux.ts` (new)
- `frontend/src/components/reports/review-history.tsx` (new)
- `frontend/src/components/reports/period-review.tsx`
- `frontend/src/components/reports/period-exports.tsx`
- `frontend/src/lib/export-period.ts`
- `frontend/tests/staff-ux.test.cjs`
- `frontend/tests/time-corrections.test.cjs`
- `frontend/tests/period-review.test.cjs`
- `frontend/tests/corrective.test.cjs`
- `backend/scripts/correction-ux.integration.test.cjs` (new)
- `FINAL_TIME_REPORTS_CORRECTIONS_UX_REPORT.md` (new)

## Validation

| Suite/check | Result |
| --- | --- |
| Complete frontend test collection | 110/110 PASS |
| Focused correction component tests | 10/10 PASS, included above |
| Focused Staff UX tests | 10/10 PASS, included above |
| Period review/history tests | 11/11 PASS, included above |
| Export/corrective tests | 10/10 PASS, included above |
| Admin Accounts real integration | 14/14 PASS |
| Onboarding/EmployeeAssignment real integration | 17/17 PASS |
| Pilot hardening real integration | 14/14 PASS |
| Predeploy corrections/period integration | 26/26 PASS |
| New correction UX real integration | 3/3 PASS |
| Staff security | 6/6 PASS |
| WorkShift security/integrity | 33/33 PASS |
| Period exports/CSV authorization | 16/16 PASS |
| Frontend and backend TypeScript noEmit | PASS |
| Frontend and backend production builds | PASS |
| Prisma validate | PASS |
| git diff --check | PASS |

Integration used only localhost `nexustaff_test` and local test Redis. The new integration suite proves failed invalid-range approval rolls back to Pending without shift mutation, rejection remains possible, simultaneous approval yields exactly one winner and one approval audit event, and a subsequent approved correction leaves previous approved history and raw AttendanceLog evidence intact.

Existing suites cover foreign Branch/company denial, role boundaries, overlapping assignments, period correction invalidation/reapproval, authoritative totals and CSV permission/financial masking. Builds emitted non-fatal webpack cache and npm configuration warnings; both completed successfully. Generated tsbuildinfo was restored to baseline.

## Local browser acceptance

Tested the real integrated UI at localhost:3100 against localhost:3101 with a disposable LOCATION_ADMIN and a separate disposable company. Existing acceptance fixtures were preserved. All records created specifically for this pass, plus temporary fixture scripts/CSV files, were cleaned up. Only test servers started by this pass were stopped.

| Scenario | Evidence/result |
| --- | --- |
| A: empty Branch without management | Explicit Department permission explanation; no inline creation controls |
| A: empty Branch with management | Empty message and Add controls; Department and Position creation worked; selected IDs updated; switching Branch cleared stale selection |
| B: overlapping assignment | Real server rejection displayed next to form naming Florida Beach; database still had exactly one assignment |
| C: approval | Dialog opened without mutation; Enter on focused Cancel left Pending and restored focus; confirmed double click yielded one approved request/audit |
| D: rejection | Distinct button; dialog; required comments; persisted Rejected and success feedback |
| E: invalid range | Safe directional message, authoritative Pending state, Reject still available; database readback confirmed Pending |
| F: approved history | No direct edit/approve/reject; immutability text; existing subsequent-correction action selected the form without changing history |
| G: History | Empty Draft state visible; expand/collapse verified; real Submitted, Rejected, Approved and correction-required/reopened events rendered chronologically |
| H: CSV | Both browser actions dispatched successfully; exact anchor filenames/unchanged Blob tested at component boundary; real authenticated HTTP CSVs opened and byte-checked locally, with authoritative 690-minute total |
| Keyboard/responsive | Cancel/Enter/Escape and focus return verified; 390px mobile dialog had 356px client/scroll widths (no horizontal overflow); viewport restored |

Browser acceptance included creating a correction through the form, approving it, and seeing updated authoritative hours. Browser date inputs were exercised via their native accessibility setter because the in-app Playwright fill did not populate the datetime-local control reliably.

## Limitations and release considerations

The in-app browser did not expose a downloadable file artifact or download event, so the operating-system save destination and browser-saved file itself were not independently inspected. This is a browser-harness limitation: filename assignment and unchanged Blob content were verified in component tests, both browser actions reported success, and the authenticated endpoint bytes were separately saved/read and verified. A native-download smoke check in the intended client browser remains recommended before release; this report does not claim that unavailable filesystem evidence passed.

Correction listing retains its existing Branch-wide/latest-100 behavior. “Create another correction” is only offered when the target shift is available in the selected period. No pagination, new data model or override endpoint was introduced. No functional release blocker was found in this scoped local pass; remote behavior was not retested or deployed.

Authorization/business rules changed: **NO**. Schema/migrations changed: **NO**. Raw evidence immutability, correction retention, state transitions, concurrency controls, period invalidation/reapproval, assignment overlap, PIN rules and server-authoritative permissions remain intact.

## Explicit acceptance answers

| Question | Answer |
| --- | --- |
| A. Can a Branch Administrator understand unavailable Department/Position? | YES — permission-aware empty states, inline controls and browser tests |
| B. Is overlap still blocked with clear feedback? | YES — real server rejection, scoped Branch name and one persisted assignment |
| C. Can a correction still be accidentally approved with one click? | NO — opening the confirmation does not call the API |
| D. Are Approve and Reject distinct? | YES — separate styled, spaced controls and separate confirmation copy |
| E. Does failed approval remain Pending and explain why? | YES for confirmed validation failures — real DB/browser evidence; uncertain network status is reported honestly |
| F. Can Approved corrections be silently edited? | NO — immutable explanation and only existing new-request workflow |
| G. Does History show real history or an explicit empty state? | YES — verified for Draft and persisted transition histories |
| H. Do filenames contain Branch and date range? | YES — exact component assertions and safe naming; native save artifact caveat above |
| I. Were attendance, correction, assignment or authorization rules weakened? | NO — unchanged backend application source and passing regressions |

READY TO COMMIT FINAL UX POLISH

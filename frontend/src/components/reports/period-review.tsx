'use client';
import { useState, useEffect, useRef } from 'react';
import { periodApprovalApi } from '@/lib/api-client';
import { can } from '@/lib/admin-access';
import { useAuthStore } from '@/store/use-auth-store';
import { useLocationStore } from '@/store/use-location-store';
export function PeriodReview() {
    const { user, token } = useAuthStore(), { selectedLocationId } = useLocationStore();
    const [periods, setPeriods] = useState<any[]>([]), [review, setReview] = useState<any>(null);
    const [start, setStart] = useState(''), [type, setType] = useState('weekly'), [notes, setNotes] = useState('');
    const [error, setError] = useState(''), [busy, setBusy] = useState(false), [approver, setApprover] = useState('ADMIN');
    const scope = JSON.stringify([user, token, selectedLocationId]), current = useRef(scope);
    current.current = scope;
    useEffect(() => { setReview(null); setPeriods([]); setError(''); setBusy(false); if (selectedLocationId && selectedLocationId !== 'ALL' && can(user, 'TIME_VIEW', selectedLocationId)) {
        periodApprovalApi.list(selectedLocationId).then(rows => { if (current.current === scope)
            setPeriods(rows); }).catch(() => { if (current.current === scope)
            setError('Unable to load periods.'); });
    } return () => { current.current = ''; }; }, [scope]);
    if (!can(user, 'TIME_VIEW', selectedLocationId))
        return null;
    const field = 'rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm';
    async function run(fn: () => Promise<void>) { const expected = scope; setBusy(true); setError(''); try {
        await fn();
    }
    catch (e: any) {
        if (current.current === expected)
            setError(e.message || 'Review unavailable.');
    }
    finally {
        if (current.current === expected)
            setBusy(false);
    } }
    async function load(id: string) { const value = await periodApprovalApi.review(id); if (current.current === scope) {
        setReview(value);
        const rows = await periodApprovalApi.list(selectedLocationId);
        if (current.current === scope)
            setPeriods(rows);
    } }
    const canAct = can(user, 'TIME_APPROVE', selectedLocationId);
    const configure = user && ['SUPER_ADMIN', 'OWNER', 'ADMIN'].includes(user.role) && can(user, 'PROPERTY_MANAGE', selectedLocationId);
    return <section className="panel p-5 space-y-4"><h3 className="font-semibold">Period review & approval</h3>
    {selectedLocationId === 'ALL' ? <p>Select one branch to review its periods. Complete-period exports above can aggregate authorized branches.</p> : <>
    <p className="text-sm text-slate-400">Review closed calendar periods, resolve incomplete shifts and pending corrections, then submit for the configured approval steps. Approved corrections require the affected periods to be reviewed and submitted again.</p>
    <div className="flex flex-wrap gap-3"><select aria-label="Review period type" className={field} value={type} onChange={e => setType(e.target.value)}><option value="weekly">Weekly</option><option value="biweekly">Biweekly</option></select><input aria-label="Review start date" type="date" className={field} value={start} onChange={e => setStart(e.target.value)}/><button disabled={busy || !start} onClick={() => run(async () => { const p = await periodApprovalApi.resolve(selectedLocationId, start, type); if (current.current === scope)
            await load(p.id); })}>Open period</button>
    <select aria-label="Existing period" className={field} value={review?.period.id || ''} onChange={e => e.target.value && run(() => load(e.target.value))}><option value="">Select existing period</option>{periods.map(p => <option key={p.id} value={p.id}>{p.startDateLabel} · {p.periodType} · {p.status}</option>)}</select></div>
    {configure && <details><summary>Configure future approval steps</summary><p className="text-sm text-slate-400">This creates a one-step workflow for future submissions. Existing submissions retain their ordered workflow. The selected role must also hold TIME_APPROVE for this branch.</p><select aria-label="Final approver role" className={field} value={approver} onChange={e => setApprover(e.target.value)}>{['ADMIN', 'OWNER', 'SUPER_ADMIN', 'MANAGER', 'LOCATION_ADMIN', 'SUPERVISOR'].map(r => <option key={r}>{r}</option>)}</select><button disabled={busy} onClick={() => run(async () => { await periodApprovalApi.configure(selectedLocationId, [{ stepName: 'Final period review', approverRole: approver }]); })}>Save approval workflow</button></details>}
    {review && <><div className="flex gap-4"><strong>Period: {review.period.status}</strong><button disabled={busy} onClick={() => run(() => load(review.period.id))}>Refresh review</button><button disabled={busy || !canAct || !review.rows.length || review.orphanAttendance > 0 || review.rows.some((r: any) => r.incompleteShifts || r.pendingCorrections || ['SUBMITTED', 'IN_REVIEW', 'APPROVED'].includes(r.status))} onClick={() => run(async () => { await periodApprovalApi.submit(review.period.id, review.reviewToken); await load(review.period.id); })}>Submit period</button></div>
    {!!review.orphanAttendance && <p role="alert">Attendance without a canonical shift must be reconciled.</p>}
    <label className="block">Review notes<textarea aria-label="Review notes" className={field + ' block w-full'} maxLength={2000} value={notes} onChange={e => setNotes(e.target.value)}/></label>
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{['Staff', 'Minutes', 'Hours', 'Incomplete', 'Corrections', 'Status', 'Review'].map(t => <th key={t} className="text-left p-2">{t}</th>)}</tr></thead><tbody>{review.rows.map((r: any) => { const step = r.steps.find((s: any) => s.stepOrder === r.currentStepOrder); const allowed = canAct && step && (!step.approverRole || step.approverRole === user?.role) && (!step.approverUserId || step.approverUserId === user?.id); return <tr key={r.staff.id}><td className="p-2">{r.staff.firstName} {r.staff.lastName}<br />{r.staff.employeeNumber}</td><td>{r.workedMinutes}</td><td>{r.workedHours.toFixed(2)}</td><td>{r.incompleteShifts}</td><td>{r.correctionCount} ({r.pendingCorrections} pending)</td><td>{r.status}{r.stale ? ' · refresh required' : ''}</td><td>{allowed && ['SUBMITTED', 'IN_REVIEW'].includes(r.status) ? ['APPROVE', 'REJECT', 'CORRECTION_REQUIRED'].map(action => <button key={action} className="p-2 underline disabled:opacity-40" disabled={busy || (action !== 'APPROVE' && !notes.trim()) || (action === 'APPROVE' && r.stale)} onClick={() => run(async () => { await periodApprovalApi.transition(r.timesheetId, r.version, action, notes); await load(review.period.id); })}>{action.replaceAll('_', ' ')}</button>) : step?.stepName || 'Awaiting submission'}<details><summary>History</summary>{r.history.map((h: any) => <p key={h.id}>{h.createdAt} · {h.actor.firstName} {h.actor.lastName} · step {h.stepOrder} · {h.previousStatus} → {h.newStatus} · {h.notes}</p>)}</details></td></tr>; })}</tbody></table></div></>}
    </>}{busy && <p role="status">Loading review…</p>}{error && <p role="alert" className="text-rose-300">{error}</p>}</section>;
}

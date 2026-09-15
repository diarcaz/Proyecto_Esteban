'use client';
import { useEffect, useState } from 'react';
import { attendanceApi } from '@/lib/api-client';
import { useLocationStore } from '@/store/use-location-store';
import { useAuthStore } from '@/store/use-auth-store';
import { can } from '@/lib/admin-access';

type Event = { id: string; timestamp: string; punchType?: string; type?: string; location?: { name?: string; locationCode?: string }; user?: { firstName?: string; lastName?: string; employeeNumber?: string } };
export function BetaAttendance() {
  const { selectedLocationId } = useLocationStore();
  const { user, token } = useAuthStore();
  const allowed = can(user, 'TIME_VIEW', selectedLocationId);
  const [result, setResult] = useState<{ scope: string; rows: Event[]; error: string | null } | null>(null);
  const [revision, setRevision] = useState(0);
  const scope = JSON.stringify([user, token, selectedLocationId]);
  useEffect(() => {
    let active = true;
    if (!allowed) { setResult(null); return; }
    async function refresh() {
      try {
        const rows = await attendanceApi.list(selectedLocationId && selectedLocationId !== 'ALL' ? { location_id: selectedLocationId } : {});
        if (!Array.isArray(rows)) throw new Error('Invalid response');
        if (active) setResult({ scope, rows, error: null });
      } catch { if (active) setResult({ scope, rows: [], error: 'Unable to load attendance. Please retry.' }); }
    }
    void refresh();
    const timer = setInterval(refresh, 15000);
    return () => { active = false; clearInterval(timer); };
  }, [scope, selectedLocationId, allowed, revision]);
  if (!allowed) return <p role="status">Attendance access is not enabled for this account/property.</p>;
  const current = result?.scope === scope ? result : null;
  return <section className="space-y-4 text-slate-200">
    <h2 className="text-2xl font-bold">Attendance events — Beta</h2>
    <p>Latest 200 recorded events for the selected property scope. Dates are shown in UTC. This is an event log; it does not calculate payroll, shift totals or current on-duty status.</p>
    <button className="rounded bg-blue-600 px-4 py-2" onClick={() => setRevision(v => v + 1)}>Refresh</button>
    {!current ? <p role="status">Loading attendance…</p> : current.error ? <p role="alert">{current.error}</p> : <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr>{['Property', 'Staff', 'Staff #', 'Timestamp (UTC)', 'Event'].map(h => <th className="p-3" key={h}>{h}</th>)}</tr></thead><tbody>
      {current.rows.map(row => <tr className="border-t border-slate-700" key={row.id}><td className="p-3">{row.location?.name || row.location?.locationCode || '—'}</td><td className="p-3">{[row.user?.firstName, row.user?.lastName].filter(Boolean).join(' ') || '—'}</td><td className="p-3">{row.user?.employeeNumber || '—'}</td><td className="p-3">{row.timestamp}</td><td className="p-3">{row.punchType || row.type || '—'}</td></tr>)}
      {!current.rows.length && <tr><td colSpan={5} className="p-3">No recorded attendance events.</td></tr>}
    </tbody></table></div>}
  </section>;
}

'use client';
import { displayLabel } from '@/lib/display-labels';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { attendanceApi } from '@/lib/api-client';
import { useLocationStore } from '@/store/use-location-store';
import { useAuthStore } from '@/store/use-auth-store';
import { can } from '@/lib/admin-access';
import { AttendanceEvent } from '@/lib/attendance-export';
import { Activity, Download, RefreshCw, Search, Users, Clock, CheckCircle2, ClipboardList } from 'lucide-react';
const filters = [{key:'ALL',label:'All punches'},{key:'CLOCK_IN',label:'Clock in'},{key:'BREAK',label:'Breaks'},{key:'CLOCK_OUT',label:'Clock out'}];
export function BetaAttendance({ overview = false }: { overview?: boolean } = {}) {
  const { selectedLocationId } = useLocationStore();
  const { user, token } = useAuthStore();
  const allowed = can(user, 'TIME_VIEW', selectedLocationId);
  const [result, setResult] = useState<{ scope: string; rows: AttendanceEvent[]; error: string | null; updated: string } | null>(null);
  const [revision, setRevision] = useState(0), [search,setSearch] = useState(''), [filter,setFilter] = useState('ALL');
  const scope = JSON.stringify([user, token, selectedLocationId]);
  useEffect(() => {
    let active = true, pending = false;
    if (!allowed) { setResult(null); return; }
    async function refresh() {
      if(pending) return; pending = true;
      try {
        const rows = await attendanceApi.list(selectedLocationId && selectedLocationId !== 'ALL' ? { location_id: selectedLocationId } : {});
        if (!Array.isArray(rows)) throw new Error('Invalid response');
        if (active) setResult({ scope, rows, error: null, updated: new Date().toLocaleTimeString() });
      } catch { if (active) setResult({ scope, rows: [], error: 'Unable to load attendance. Please retry.', updated: '' }); }
      finally { pending = false; }
    }
    void refresh(); const timer = setInterval(refresh, 15000);
    return () => { active = false; clearInterval(timer); };
  }, [scope, selectedLocationId, allowed, revision]);
  if (!allowed) return <p role="status">Attendance access is not enabled for this account or branch.</p>;
  const current = result?.scope === scope ? result : null;
  const rows = (current?.rows || []).filter(row => {
    const type = row.punchType || row.type || '';
    return (filter === 'ALL' || (filter === 'BREAK' ? type.startsWith('LUNCH') : type === filter)) && [row.user?.firstName,row.user?.lastName,row.user?.employeeNumber,row.location?.name].join(' ').toLowerCase().includes(search.toLowerCase());
  });
  return <section className="space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-4"><div><p className="eyebrow">Time & attendance</p><h2 className="page-title">{overview ? 'Live Overview' : 'Live Attendance Logs'}</h2><p className="text-sm text-slate-400">{overview ? 'Your authorized branches, at a glance.' : 'Review recorded punches across your selected branch scope.'}</p></div><button className="flex gap-2 items-center rounded-xl border border-slate-700 px-4 py-2 text-sm hover:bg-slate-800" onClick={()=>setRevision(v=>v+1)}><RefreshCw size={15}/>Refresh</button></header>
    {overview && <div className="grid sm:grid-cols-3 gap-4">{[{title:'Recent recorded punches',value:current?.rows.length},{title:'Clock-ins in this window',value:current?.rows.filter(r=>(r.punchType||r.type)==='CLOCK_IN').length},{title:'Clock-outs in this window',value:current?.rows.filter(r=>(r.punchType||r.type)==='CLOCK_OUT').length}].map(m=><article className="panel p-5" key={m.title}><p className="text-sm text-slate-400">{m.title}</p><p className="text-3xl font-semibold mt-2">{!current?'Loading…':current.error?'Unavailable':m.value}</p><p className="text-xs text-slate-500 mt-2">Latest 200 events in your authorized branch selection</p></article>)}</div>}
    {overview && <section><div className="flex items-center gap-2 text-sm mb-3"><Activity size={16} className="text-blue-400"/>Recent activity <span className="text-xs text-slate-500">Refreshes every 15 seconds</span></div><div className="grid md:grid-cols-3 gap-3">{current?.rows.slice(0,3).map(row=><article key={row.id} className="panel p-4"><p className="font-semibold">{row.user?.firstName} {row.user?.lastName}</p><p className="text-sm text-blue-300 mt-1">{displayLabel(row.punchType || row.type || '')}</p><p className="text-xs text-slate-400 mt-2">{row.location?.name} · {new Date(row.timestamp).toLocaleTimeString('en-GB',{timeZone:'UTC'})} UTC</p></article>)}{current && !current.rows.length && <p className="text-sm text-slate-400">No recent activity available.</p>}</div></section>}
    <section className="panel overflow-hidden"><div className="p-4 space-y-4 border-b border-slate-800"><div className="flex flex-wrap justify-between items-center gap-3"><h3 className="font-semibold">Recorded attendance</h3><Link href="/admin/reports" className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm"><Download size={16}/>Export complete period</Link></div><div className="flex flex-wrap gap-3 justify-between"><label className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2"><Search size={16} className="text-slate-400"/><input aria-label="Search attendance" placeholder="Search staff or branch" value={search} onChange={e=>setSearch(e.target.value)} className="bg-transparent text-sm outline-none min-w-0"/></label><div className="flex flex-wrap gap-1">{filters.map(f=><button key={f.key} aria-pressed={filter===f.key} onClick={()=>setFilter(f.key)} className={filter===f.key?'rounded-lg bg-blue-500/20 px-3 py-2 text-xs text-blue-300':'rounded-lg px-3 py-2 text-xs text-slate-400 hover:bg-slate-800'}>{f.label}</button>)}</div></div><p className="text-xs text-slate-500">Latest 200 events · Times shown in UTC (not your device timezone) · Search and filters apply to this loaded window. Period exports include all shifts. These counts describe recorded events, not current on-site Staff.</p></div>
    {!current ? <p className="p-6" role="status">Loading attendance…</p> : current.error ? <p role="alert" className="p-6 text-rose-300">{current.error}</p> : <div className="overflow-x-auto"><table className="data-table"><thead><tr>{['Staff member','Staff #','Branch','Timestamp (UTC)','Event'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.id}><td>{[row.user?.firstName,row.user?.lastName].filter(Boolean).join(' ') || '—'}</td><td className="font-mono">{row.user?.employeeNumber || '—'}</td><td>{row.location?.name || row.location?.locationCode || '—'}</td><td className="whitespace-nowrap tabular-nums">{new Date(row.timestamp).toLocaleString('en-GB',{timeZone:'UTC'})}</td><td><span className="status-badge">{displayLabel(row.punchType || row.type || '—')}</span></td></tr>)}{!rows.length && <tr><td colSpan={5}>No recorded attendance events match this view.</td></tr>}</tbody></table></div>}
    <footer className="border-t border-slate-800 px-4 py-3 text-xs text-slate-500">{current && !current.error ? rows.length + ' events in view · Updated ' + current.updated : 'Waiting for attendance data'}</footer></section>
  </section>;
}

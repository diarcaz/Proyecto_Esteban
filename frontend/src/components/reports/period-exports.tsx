'use client';
import { useEffect, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { reportsApi } from '@/lib/api-client';
import { can } from '@/lib/admin-access';
import { periodParameters, reportFilename } from '@/lib/export-period';
import { useAuthStore } from '@/store/use-auth-store';
import { useLocationStore } from '@/store/use-location-store';

export function PeriodExports() {
  const {user,token}=useAuthStore();
  const {selectedLocationId,locations}=useLocationStore();
  const [period,setPeriod]=useState('weekly');
  const [start,setStart]=useState(''),[end,setEnd]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const scope=JSON.stringify([user,token,selectedLocationId,period,start,end]);
  const current=useRef(scope); current.current=scope;
  useEffect(()=>{current.current=scope;setBusy(false);setError('');setNotice('');return()=>{current.current='';};},[scope]);
  if(!can(user,'TIME_VIEW',selectedLocationId)) return null;
  async function download(kind:'detail'|'summary') {
    const requestedScope=scope;
    setBusy(true);setError('');setNotice('');
    try {
      const data=await reportsApi.periodCsv(kind,periodParameters(period,start,end,selectedLocationId));
      if(current.current!==requestedScope) return;
      const url=URL.createObjectURL(data),link=document.createElement('a');
      link.href=url;link.download=reportFilename(kind,locations?.find(l=>l.id===selectedLocationId)?.name,period,start,end,!selectedLocationId||selectedLocationId==='ALL');link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      setNotice('Complete period export downloaded. Incomplete shifts and unavailable approvals are explicitly marked.');
    } catch(e:any) {if(current.current===requestedScope)setError(e.message || 'Period export failed. No partial file was downloaded.');}
    finally {if(current.current===requestedScope)setBusy(false);}
  }
  const field='block w-full mt-2 rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm';
  return <section className="panel p-5 space-y-5">
    <div><h3 className="font-semibold text-lg">Complete period exports</h3><p className="text-sm text-slate-400 mt-2">All authorized shifts for the selected period, independent of the 200-event screen. Work dates use each branch’s timezone; timestamps in the CSV are UTC.</p></div>
    <div className="grid sm:grid-cols-3 gap-4">
      <label className="text-sm">Period<select aria-label="Export period" className={field} value={period} onChange={e=>setPeriod(e.target.value)}><option value="weekly">Weekly · 7 days</option><option value="biweekly">Biweekly · 14 days</option><option value="custom">Custom range</option></select></label>
      <label className="text-sm">Start date<input aria-label="Export start date" type="date" required className={field} value={start} onChange={e=>setStart(e.target.value)}/></label>
      {period==='custom' ? <label className="text-sm">End date (inclusive)<input aria-label="Export end date" type="date" required min={start} className={field} value={end} onChange={e=>setEnd(e.target.value)}/></label> : <p className="text-sm text-slate-400 self-center">{period==='weekly'?'7':'14'} calendar days beginning on the selected start date.</p>}
    </div>
    <div className="flex flex-wrap gap-3">{(['detail','summary'] as const).map(kind=><button key={kind} disabled={busy||!start||(period==='custom'&&!end)} onClick={()=>download(kind)} className="flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 px-4 py-3 text-sm font-semibold disabled:opacity-40"><Download size={16}/>{kind==='detail'?'Attendance detail CSV':'Period summary CSV'}</button>)}</div>
    {busy&&<p role="status">Preparing complete export…</p>}{error&&<p role="alert" className="text-rose-300">{error}</p>}{notice&&<p role="status" className="text-emerald-300">{notice}</p>}
    <p className="text-xs text-slate-500">One detail row per shift, attributed to its effective branch-local start date, including overnight shifts. Summary totals include completed shifts only; incomplete shifts are counted. Maximum period: 366 days. No payroll amounts.</p>
  </section>;
}

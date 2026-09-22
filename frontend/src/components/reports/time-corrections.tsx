'use client';
import { useEffect, useState } from 'react';
import { timeCorrectionsApi } from '@/lib/api-client';
import { can } from '@/lib/admin-access';
import { displayLabel } from '@/lib/display-labels';
import { useAuthStore } from '@/store/use-auth-store';

export function TimeCorrections({ locationId, rows, onChanged }: { locationId:string; rows:any[]; onChanged:()=>Promise<void> }) {
  const {user}=useAuthStore();
  const [requests,setRequests]=useState<any[]>([]),[shiftId,setShiftId]=useState(''),[type,setType]=useState('MISSED_CLOCK_OUT'),[at,setAt]=useState(''),[reason,setReason]=useState(''),[comments,setComments]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{let active=true;timeCorrectionsApi.list(locationId).then(data=>{if(active)setRequests(data);}).catch(()=>{if(active)setError('Unable to load correction history.');});return()=>{active=false;};},[locationId]);
  const shifts=rows.flatMap(r=>(r.shifts||[]).map((s:any)=>({...s,staff:r.staff})));
  async function run(work:()=>Promise<unknown>){setBusy(true);setError('');setNotice('');try{await work();setRequests(await timeCorrectionsApi.list(locationId));await onChanged();setNotice('Correction saved. Review updated hours and approval status.');}catch(e:any){setError(e.message||'Correction was not saved.');}finally{setBusy(false);}}
  const field='block w-full rounded-lg border border-slate-700 p-2';
  return <details className="space-y-3"><summary>Time corrections</summary><p>Correct verified times without changing original punch evidence. Approved corrections may reopen prior approvals.</p>
    {can(user,'TIME_EDIT',locationId)&&<form className="grid gap-3 md:grid-cols-2" onSubmit={e=>{e.preventDefault();void run(async()=>{await timeCorrectionsApi.create({location_id:locationId,work_shift_id:shiftId,correction_type:type,requested_timestamp:new Date(at).toISOString(),reason});setReason('');setAt('');});}}>
      <label>Shift to correct<select aria-label="Shift to correct" required className={field} value={shiftId} onChange={e=>setShiftId(e.target.value)}><option value="">Select Staff and shift</option>{shifts.map(s=><option key={s.id} value={s.id}>{s.staff.firstName} {s.staff.lastName} · {new Date(s.clockIn).toISOString()} · {displayLabel(s.status)}</option>)}</select></label>
      <label>Correction type<select aria-label="Correction type" className={field} value={type} onChange={e=>setType(e.target.value)}><option value="MISSED_CLOCK_OUT">Missed clock out</option><option value="INCORRECT_CLOCK_IN">Correct clock in</option><option value="INCORRECT_CLOCK_OUT">Correct clock out</option></select></label>
      <label>Verified time (your device timezone)<input aria-label="Verified correction time" type="datetime-local" required className={field} value={at} onChange={e=>setAt(e.target.value)}/></label>
      <label>Reason<textarea aria-label="Correction reason" required maxLength={2000} className={field} value={reason} onChange={e=>setReason(e.target.value)}/></label><button disabled={busy||!shiftId} className="rounded-lg bg-blue-600 p-3 text-white">Request correction</button>
    </form>}
    {can(user,'TIME_APPROVE',locationId)&&<label>Reviewer comments<textarea aria-label="Correction reviewer comments" maxLength={2000} className={field} value={comments} onChange={e=>setComments(e.target.value)}/></label>}
    {requests.length===0?<p>No correction requests for this branch.</p>:<div className="overflow-x-auto"><table><thead><tr>{['Staff','Correction','Verified time (UTC)','Reason','Status','Review'].map(t=><th key={t}>{t}</th>)}</tr></thead><tbody>{requests.map(r=><tr key={r.id}><td>{r.user?.firstName} {r.user?.lastName}</td><td>{displayLabel(r.correctionType)}</td><td>{r.requestedTimestamp}</td><td>{r.reason}</td><td>{displayLabel(r.status)}</td><td>{r.status==='PENDING'&&can(user,'TIME_APPROVE',locationId)?<><button disabled={busy} onClick={()=>void run(()=>timeCorrectionsApi.review(r.id,'approve',comments))}>Approve correction</button><button disabled={busy||!comments.trim()} onClick={()=>void run(()=>timeCorrectionsApi.review(r.id,'reject',comments))}>Reject correction</button></>:r.comments||'Recorded'}</td></tr>)}</tbody></table></div>}
    {busy&&<p role="status">Saving correction…</p>}{notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error}</p>}
  </details>;
}

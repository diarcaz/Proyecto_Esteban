'use client';
import { useEffect, useRef, useState } from 'react';
import { timeCorrectionsApi } from '@/lib/api-client';
import { can } from '@/lib/admin-access';
import { displayLabel } from '@/lib/display-labels';
import { correctionError, correctionTime } from '@/lib/correction-ux';
import { useAuthStore } from '@/store/use-auth-store';

export function TimeCorrections({ locationId, rows, branch, onChanged }: { locationId:string; rows:any[]; branch?:{name:string;timezone?:string}; onChanged:()=>Promise<void> }) {
  const {user,token}=useAuthStore();
  const [requests,setRequests]=useState<any[]>([]),[shiftId,setShiftId]=useState(''),[type,setType]=useState('MISSED_CLOCK_OUT'),[at,setAt]=useState(''),[reason,setReason]=useState(''),[comments,setComments]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
  const [decision,setDecision]=useState<{request:any;action:'approve'|'reject'}|null>(null);
  const summary=useRef<HTMLElement>(null);
  const pending=useRef(false),dialog=useRef<HTMLDialogElement>(null),cancel=useRef<HTMLButtonElement>(null),opener=useRef<HTMLElement|null>(null),shiftSelect=useRef<HTMLSelectElement>(null);
  const scope=JSON.stringify([locationId,token,user]),current=useRef(scope);current.current=scope;
  useEffect(()=>{let active=true;setRequests([]);setBusy(false);setError('');setNotice('');setDecision(null);timeCorrectionsApi.list(locationId).then(data=>{if(active)setRequests(data);}).catch(()=>{if(active)setError('Unable to load correction history.');});return()=>{active=false;current.current='';};},[scope]);
  useEffect(()=>{if(decision){dialog.current?.showModal();cancel.current?.focus();}else if(dialog.current?.open){dialog.current.close();if(opener.current?.isConnected)opener.current.focus();else summary.current?.focus();}},[decision]);
  const shifts=rows.flatMap(r=>(r.shifts||[]).map((s:any)=>({...s,staff:r.staff})));
  const zone=branch?.timezone,zoneLabel=zone ? `${branch?.name || 'Branch'} time (${zone})` : 'UTC (Branch timezone unavailable)';
  async function run(work:()=>Promise<unknown>,success:string,review?:{request:any;action:'approve'|'reject'}) {
    if(pending.current)return;pending.current=true;setBusy(true);setError('');setNotice('');const expected=scope;
    try {
      await work();if(current.current!==expected)return;
      setNotice(success);setDecision(null);
      if(review)setRequests(previous=>previous.map(r=>r.id===review.request.id?{...r,status:review.action==='approve'?'APPROVED':'REJECTED',comments}:r));
      // Refresh errors must never be misrepresented as a failed mutation.
      try {const data=await timeCorrectionsApi.list(locationId);if(current.current!==expected)return;setRequests(data);await onChanged();}
      catch {if(current.current===expected)setError('The correction was saved, but the latest review could not be loaded. Refresh before another action.');}
    } catch(e:any) {
      if(current.current!==expected)return;
      let message=correctionError(e,review?.request.correctionType || type);
      if(review) {
        try {const data=await timeCorrectionsApi.list(locationId);if(current.current!==expected)return;setRequests(data);
          if(data.find((r:any)=>r.id===review.request.id)?.status==='PENDING')message+=' This request remains Pending. You can still reject it with reviewer comments, or use a new correction to correct the surrounding attendance.';
          else message+=' The latest request status is shown below. Review it before taking another action.';
        } catch {message+=' Status could not be refreshed. Refresh before retrying; the action may have completed.';}
        setDecision(null);
      }
      setError(message);
    } finally {pending.current=false;if(current.current===expected)setBusy(false);}
  }
  function choose(request:any,action:'approve'|'reject',button:HTMLElement){if(pending.current)return;opener.current=button;setError('');setNotice('');setDecision({request,action});}
  function dismiss(){if(!pending.current)setDecision(null);}
  const field='block w-full rounded-lg border border-slate-700 p-2';
  const approve='admin-primary-button rounded-lg border px-4 py-2 disabled:opacity-40';
  const reject='rounded-lg border border-rose-500 px-4 py-2 text-rose-600 dark:text-rose-300 disabled:opacity-40';
  return <details className="space-y-3"><summary ref={summary} tabIndex={-1}>Time corrections</summary><p>Correct verified times without changing original punch evidence. Approved corrections may reopen prior approvals.</p>
    {can(user,'TIME_EDIT',locationId)&&<form className="grid gap-3 md:grid-cols-2" onSubmit={e=>{e.preventDefault();void run(async()=>{await timeCorrectionsApi.create({location_id:locationId,work_shift_id:shiftId,correction_type:type,requested_timestamp:new Date(at).toISOString(),reason});if(current.current===scope){setReason('');setAt('');}},'Correction request created.');}}>
      <label>Shift to correct<select ref={shiftSelect} aria-label="Shift to correct" required className={field} value={shiftId} onChange={e=>{setShiftId(e.target.value);setError('');}}><option value="">Select Staff and shift</option>{shifts.map(s=><option key={s.id} value={s.id}>{s.staff.firstName} {s.staff.lastName} · {correctionTime(s.clockIn,zone)} · {displayLabel(s.status)}</option>)}</select><small>{zoneLabel}</small></label>
      <label>Correction type<select aria-label="Correction type" className={field} value={type} onChange={e=>setType(e.target.value)}><option value="MISSED_CLOCK_OUT">Missed clock out</option><option value="INCORRECT_CLOCK_IN">Correct clock in</option><option value="INCORRECT_CLOCK_OUT">Correct clock out</option></select></label>
      <label>Verified time (your device timezone)<input aria-label="Verified correction time" type="datetime-local" required className={field} value={at} onChange={e=>setAt(e.target.value)}/></label>
      <label>Reason<textarea aria-label="Correction reason" required maxLength={2000} className={field} value={reason} onChange={e=>setReason(e.target.value)}/></label><button disabled={busy||!shiftId} className={approve}>Request correction</button>
    </form>}
    {can(user,'TIME_APPROVE',locationId)&&<label>Reviewer comments (required to reject)<textarea aria-label="Correction reviewer comments" maxLength={2000} className={field} value={comments} onChange={e=>setComments(e.target.value)}/></label>}
    {busy&&<p role="status">Saving correction…</p>}{notice&&<p role="status">{notice}</p>}{error&&<p role="alert" className="rounded border border-rose-500 p-3">{error}</p>}
    {requests.length===0?<p>No correction requests for this branch.</p>:<div className="overflow-x-auto"><table className="data-table w-full"><thead><tr>{['Staff','Correction','Verified time','Reason','Status','Review'].map(t=><th key={t}>{t}</th>)}</tr></thead><tbody>{requests.map(r=><tr key={r.id}><td>{r.user?.firstName} {r.user?.lastName}</td><td>{displayLabel(r.correctionType)}</td><td><time title={r.requestedTimestamp}>{correctionTime(r.requestedTimestamp,zone)}</time><small className="block">{zoneLabel}</small></td><td>{r.reason}</td><td>{displayLabel(r.status)}</td><td>
      {r.status==='PENDING'&&can(user,'TIME_APPROVE',locationId)&&<div className="flex flex-wrap gap-3 py-2"><button type="button" className={approve} disabled={busy} onClick={e=>choose(r,'approve',e.currentTarget)}>Approve correction</button><button type="button" className={reject} disabled={busy} onClick={e=>choose(r,'reject',e.currentTarget)}>Reject correction</button></div>}
      {r.status==='APPROVED'&&<><p>Approved corrections cannot be edited directly because they are part of the attendance audit history.</p><p>To correct this verified time again, create a new correction using the correction request form for the relevant shift and period.</p>{can(user,'TIME_EDIT',locationId)&&shifts.some(s=>s.id===r.workShiftId)&&<button type="button" className="underline p-2" disabled={busy} onClick={()=>{setShiftId(r.workShiftId);setType(r.correctionType==='INCORRECT_CLOCK_IN'?'INCORRECT_CLOCK_IN':'INCORRECT_CLOCK_OUT');setAt('');setReason('');setError('');shiftSelect.current?.focus();}}>Create another correction</button>}</>}
      {r.comments&&<p>{r.comments}</p>}
    </td></tr>)}</tbody></table></div>}
    <dialog ref={dialog} aria-labelledby="correction-confirm-title" aria-describedby="correction-confirm-impact" className="panel w-[calc(100%-2rem)] max-w-lg max-h-[90dvh] overflow-y-auto rounded-xl p-6 backdrop:bg-black/60" onCancel={e=>{e.preventDefault();dismiss();}} onKeyDown={e=>{if(e.key==='Enter'&&e.target===e.currentTarget)e.preventDefault();}}>
      {decision&&<div className="space-y-4"><h3 id="correction-confirm-title" className="text-lg font-semibold">{decision.action==='approve'?'Approve':'Reject'} this correction?</h3>
        <dl className="space-y-2"><dt>Staff</dt><dd>{decision.request.user?.firstName} {decision.request.user?.lastName}</dd><dt>Correction</dt><dd>{displayLabel(decision.request.correctionType)}</dd><dt>Verified time</dt><dd title={decision.request.requestedTimestamp}>{correctionTime(decision.request.requestedTimestamp,zone)}<small className="block">{zoneLabel}</small></dd><dt>Reason</dt><dd className="whitespace-pre-wrap break-words">{decision.request.reason}</dd></dl>
        <p id="correction-confirm-impact">{decision.action==='approve'?'This correction will become part of the verified attendance record and may affect period review/approval.':'This request will be rejected. The verified attendance record will not be changed by this rejection.'}</p>
        {decision.action==='reject'&&<label>Reviewer comments (required)<textarea autoComplete="off" aria-label="Rejection comments" className={field} maxLength={2000} value={comments} onChange={e=>setComments(e.target.value)}/></label>}
        <div className="flex flex-wrap gap-3"><button ref={cancel} type="button" className="admin-secondary-button rounded-lg border px-4 py-2" disabled={busy} onClick={dismiss}>Cancel</button><button type="button" aria-busy={busy} className={decision.action==='approve'?approve:reject} disabled={busy||(decision.action==='reject'&&!comments.trim())} onClick={()=>{if(decision.action==='reject'&&!comments.trim())return;void run(()=>timeCorrectionsApi.review(decision.request.id,decision.action,comments),decision.action==='approve'?'Correction approved.':'Correction rejected.',decision);}}>{busy?'Saving…':decision.action==='approve'?'Approve correction':'Reject correction'}</button></div>
      </div>}
    </dialog>
  </details>;
}

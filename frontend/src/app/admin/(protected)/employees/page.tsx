'use client';
import { useEffect, useRef, useState } from 'react';
import { locationsApi, staffApi, onboardingApi } from '@/lib/api-client';
import { useAuthStore } from '@/store/use-auth-store';
import { useLocationStore } from '@/store/use-location-store';
import { can } from '@/lib/admin-access';
const inputClass = 'w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-white';
const buttonClass = 'rounded-lg bg-blue-600 px-3 py-2 text-white disabled:opacity-40';
function localNow() { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0,16); }
function IdentityEditor({ detail, onSaved }: { detail: any; onSaved: () => void }) {
  const [firstName,setFirstName]=useState(detail.firstName),[lastName,setLastName]=useState(detail.lastName),[error,setError]=useState(''),[saving,setSaving]=useState(false);
  return <form className="flex flex-wrap gap-2" onSubmit={async e=>{e.preventDefault();setSaving(true);setError('');try{await staffApi.update(detail.id,{firstName,lastName});onSaved();}catch{setError('Employee changes were not saved.');}finally{setSaving(false);}}}>
    <label>First name<input required className={inputClass} value={firstName} onChange={e=>setFirstName(e.target.value)}/></label><label>Last name<input required className={inputClass} value={lastName} onChange={e=>setLastName(e.target.value)}/></label><button disabled={saving} className={buttonClass}>Save employee details</button>{error&&<p role="alert">{error}</p>}
  </form>;
}
const emptyAssignment = () => ({ propertyId: '', departmentId: '', positionId: '', effectiveFrom: localNow(), effectiveUntil: '', active: true });
export default function EmployeesPage() {
  const { user, token } = useAuthStore();
  const { selectedLocationId } = useLocationStore();
  const [employees, setEmployees] = useState<any[]>([]), [properties, setProperties] = useState<any[]>([]);
  const [detail, setDetail] = useState<any>(null), [selectedId, setSelectedId] = useState('');
  const [mode, setMode] = useState<'create'|'assignment'|null>(null), [assignment, setAssignment] = useState(emptyAssignment);
  const [identity, setIdentity] = useState({ firstName: '', lastName: '', employeeNumber: '', email: '', pinCode: '', status: 'ACTIVE' });
  const [catalog, setCatalog] = useState<any>(null), [catalogVersion, setCatalogVersion] = useState(0);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const [pin, setPin] = useState<string|null>(null), [newPin, setNewPin] = useState('');
  const [newDepartment, setNewDepartment] = useState({ name: '', code: '' }), [newPosition, setNewPosition] = useState({ name: '', code: '' });
  const generation = useRef(0);
  async function refresh() {
    const data = await staffApi.list();
    if (!Array.isArray(data)) throw new Error('Unable to load employees.');
    setEmployees(data.filter(e => e.role === 'WORKER'));
  }
  useEffect(() => {
    let active = true; setEmployees([]); setDetail(null); setSelectedId(''); setPin(null); setMode(null);
    Promise.all([staffApi.list(), locationsApi.list()]).then(([staff, locations]) => {
      if (active) { setEmployees(staff.filter((e:any) => e.role === 'WORKER')); setProperties(locations); }
    }).catch(() => { if (active) setError('Unable to load employees/properties.'); });
    return () => { active = false; generation.current++; };
  }, [token]);
  useEffect(() => {
    let active = true; setCatalog(null);
    if (assignment.propertyId) onboardingApi.catalog(assignment.propertyId).then(data => { if (active) setCatalog(data); }).catch(() => { if (active) setError('Unable to load property departments/positions.'); });
    return () => { active = false; };
  }, [assignment.propertyId, catalogVersion, token]);
  useEffect(() => { if (!pin) return; const timer = setTimeout(() => setPin(null), 15000); return () => clearTimeout(timer); }, [pin]);
  async function select(id:string) {
    const current = ++generation.current; setSelectedId(id); setDetail(null); setPin(null); setNewPin(''); setMode(null);
    try { const data = await onboardingApi.details(id); if (current === generation.current) setDetail(data); }
    catch { if (current === generation.current) setError('Unable to load employee assignments.'); }
  }
  async function action(work:()=>Promise<void>) { setBusy(true); setError(''); setNotice(''); try { await work(); } catch (e:any) { setError(e.message || 'Operation failed. Nothing was confirmed saved.'); } finally { setBusy(false); } }
  function open(mode:'create'|'assignment') { setMode(mode); setPin(null); setAssignment({ ...emptyAssignment(), propertyId: selectedLocationId !== 'ALL' ? selectedLocationId : '' }); setIdentity({ firstName:'', lastName:'', employeeNumber:'', email:'', pinCode:'', status:'ACTIVE' }); setCatalog(null); setError(''); }
  async function submit(e:React.FormEvent) {
    e.preventDefault();
    await action(async () => {
      const data = { ...assignment, effectiveFrom: new Date(assignment.effectiveFrom).toISOString(), effectiveUntil: assignment.effectiveUntil ? new Date(assignment.effectiveUntil).toISOString() : undefined };
      const id = mode === 'create' ? (await onboardingApi.create({ ...data, ...identity, email: identity.email || undefined, role: 'WORKER', active: true })).id : selectedId;
      if (mode === 'assignment') await onboardingApi.add(id, data);
      setIdentity(i=>({...i,pinCode:''})); setMode(null); await refresh(); await select(id); setNotice('Saved. Clock readiness is evaluated by the server below.');
    });
  }
  const filtered = employees.filter(e => selectedLocationId === 'ALL' || e.employeeAssignments?.some((a:any)=>a.propertyId===selectedLocationId) || e.assignments?.some((a:any)=>a.locationId===selectedLocationId));
  const canSubmit = can(user, mode === 'create' ? 'STAFF_CREATE' : 'STAFF_EDIT', assignment.propertyId);
  return <section className="space-y-5 text-slate-200">
    <header className="flex justify-between gap-4"><div><h2 className="text-2xl font-bold">Employees & work assignments</h2><p className="text-sm text-slate-400">A work assignment with a department and position is required for /clock.</p></div><button className={buttonClass} disabled={busy || !can(user,'STAFF_CREATE',selectedLocationId)} onClick={()=>open('create')}>Create Employee</button></header>
    {error && <p role="alert" className="rounded bg-red-950 p-3">{error}</p>}{notice && <p role="status" className="rounded bg-emerald-950 p-3">{notice}</p>}
    <div className="flex flex-wrap gap-2">{filtered.map(e=><button key={e.id} disabled={busy} className="rounded border border-slate-700 p-3" onClick={()=>select(e.id)}>{e.employeeNumber} — {e.firstName} {e.lastName}</button>)}{!filtered.length && <p>No active employees in this property scope.</p>}</div>
    {detail && <article className="space-y-3 rounded-xl border border-slate-700 p-4">
      <h3 className="text-lg font-bold">{detail.employeeNumber} — {detail.firstName} {detail.lastName}</h3><p>Account: {detail.status}</p>
      {detail.readiness.some((r:any)=>r.canEdit) && <IdentityEditor key={detail.id} detail={detail} onSaved={()=>{void select(detail.id);void refresh();}}/>}
      {!detail.readiness.length && <p>Assignment Required</p>}
      {detail.readiness.map((r:any)=><p key={r.propertyId}>{r.name}: <strong>{r.clockReady ? 'Clock Ready' : 'Assignment Required'}</strong></p>)}
      <p className="text-xs text-slate-400">Readiness reflects account/PIN and effective assignment context. Current shift sequence and operational checks still apply.</p>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['Property','Department','Position','Effective dates (UTC)','State','Action'].map(h=><th className="p-2" key={h}>{h}</th>)}</tr></thead><tbody>{detail.assignments.map((a:any)=><tr key={a.id} className="border-t border-slate-800"><td className="p-2">{a.property}</td><td>{a.department}</td><td>{a.position}</td><td>{a.effectiveFrom} — {a.effectiveUntil || 'No end date'}</td><td>{a.active?'Active':'Inactive'}</td><td>{a.active && detail.readiness.some((r:any)=>r.propertyId===a.propertyId&&r.canEdit) && <button disabled={busy} className={buttonClass} onClick={()=>action(async()=>{ await onboardingApi.deactivate(selectedId,a.id); await select(selectedId); await refresh(); })}>Deactivate</button>}</td></tr>)}</tbody></table></div>
      <button disabled={busy || !can(user,'STAFF_EDIT',selectedLocationId)} className={buttonClass} onClick={()=>open('assignment')}>Add Assignment</button>
      <div className="flex flex-wrap items-center gap-3">
        {detail.canViewPin && <button disabled={busy} className={buttonClass} onClick={()=>action(async()=>{const g=generation.current; const result=await onboardingApi.pin(selectedId); if(g===generation.current) setPin(result.pinCode || 'Unavailable — authorized reset required');})}>View PIN</button>}
        {detail.canViewPin && pin && <p role="status">PIN: {pin} <button onClick={()=>setPin(null)}>Hide</button></p>}
        {detail.canResetPin && <form className="flex gap-2" onSubmit={e=>{e.preventDefault();void action(async()=>{await onboardingApi.resetPin(selectedId,newPin);setNewPin('');setPin(null);setNotice('PIN reset saved.');});}}><label>New six-digit PIN<input aria-label="New six-digit PIN" className={inputClass} type="password" required pattern="[0-9]{6}" maxLength={6} value={newPin} onChange={e=>setNewPin(e.target.value)}/></label><button disabled={busy} className={buttonClass}>Reset PIN</button></form>}
      </div>
    </article>}
    {mode && <form onSubmit={submit} className="space-y-4 rounded-xl border border-slate-700 bg-slate-900 p-5">
      <h3 className="text-lg font-bold">{mode==='create'?'New WORKER':'Additional work assignment'}</h3>
      {mode==='create' && <div className="grid gap-3 md:grid-cols-3">{(['firstName','lastName','employeeNumber','email','pinCode'] as const).map(key=><label key={key}>{({firstName:'First name',lastName:'Last name',employeeNumber:'Employee number (EMP-...)',email:'Email (optional)',pinCode:'Initial six-digit PIN'})[key]}<input className={inputClass} required={key!=='email'} type={key==='pinCode'?'password':key==='email'?'email':'text'} pattern={key==='pinCode'?'[0-9]{6}':key==='employeeNumber'?'EMP-[A-Za-z0-9-]{1,40}':undefined} maxLength={key==='pinCode'?6:100} value={identity[key]} onChange={e=>setIdentity({...identity,[key]:e.target.value})}/></label>)}<label>Status<select className={inputClass} value={identity.status} onChange={e=>setIdentity({...identity,status:e.target.value})}><option>ACTIVE</option><option>TERMINATED</option></select></label></div>}
      <div className="grid gap-3 md:grid-cols-3">
        <label>Property<select required className={inputClass} value={assignment.propertyId} onChange={e=>{setAssignment({...assignment,propertyId:e.target.value,departmentId:'',positionId:''});setCatalog(null);}}><option value="">Select Property</option>{properties.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label>Department<select required className={inputClass} disabled={!catalog} value={assignment.departmentId} onChange={e=>setAssignment({...assignment,departmentId:e.target.value,positionId:''})}><option value="">Select Department</option>{catalog?.departments.map((d:any)=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
        <label>Position<select required className={inputClass} disabled={!assignment.departmentId} value={assignment.positionId} onChange={e=>setAssignment({...assignment,positionId:e.target.value})}><option value="">Select Position</option>{catalog?.positions.filter((p:any)=>p.departmentId===assignment.departmentId).map((p:any)=><option key={p.id} value={p.id}>{p.title}</option>)}</select></label>
        <label>Effective from (browser local time)<input required type="datetime-local" className={inputClass} value={assignment.effectiveFrom} onChange={e=>setAssignment({...assignment,effectiveFrom:e.target.value})}/></label>
        <label>Effective until (optional)<input type="datetime-local" className={inputClass} value={assignment.effectiveUntil} onChange={e=>setAssignment({...assignment,effectiveUntil:e.target.value})}/></label>
        {mode==='assignment' && <label>Active<input type="checkbox" checked={assignment.active} onChange={e=>setAssignment({...assignment,active:e.target.checked})}/></label>}
      </div>
      {catalog?.canManage && <div className="grid gap-4 md:grid-cols-2">
        <fieldset className="space-y-2 rounded border border-slate-700 p-3"><legend>Add Department to selected Property</legend><input aria-label="Department name" className={inputClass} placeholder="Department name" value={newDepartment.name} onChange={e=>setNewDepartment({...newDepartment,name:e.target.value})}/><input aria-label="Department code" className={inputClass} placeholder="Department code" value={newDepartment.code} onChange={e=>setNewDepartment({...newDepartment,code:e.target.value})}/><button type="button" disabled={busy||!newDepartment.name||!newDepartment.code} className={buttonClass} onClick={()=>action(async()=>{await onboardingApi.department(assignment.propertyId,newDepartment);setNewDepartment({name:'',code:''});setCatalogVersion(v=>v+1);})}>Add Department</button></fieldset>
        <fieldset className="space-y-2 rounded border border-slate-700 p-3"><legend>Add Position to selected Department</legend><input aria-label="Position title" className={inputClass} placeholder="Position title" value={newPosition.name} onChange={e=>setNewPosition({...newPosition,name:e.target.value})}/><input aria-label="Position code" className={inputClass} placeholder="Position code" value={newPosition.code} onChange={e=>setNewPosition({...newPosition,code:e.target.value})}/><button type="button" disabled={busy||!assignment.departmentId||!newPosition.name||!newPosition.code} className={buttonClass} onClick={()=>action(async()=>{await onboardingApi.position(assignment.propertyId,{...newPosition,departmentId:assignment.departmentId});setNewPosition({name:'',code:''});setCatalogVersion(v=>v+1);})}>Add Position</button></fieldset>
      </div>}
      <p className="text-sm text-slate-400">No payroll or billing rates are entered. New employees require an active effective assignment before clocking.</p>
      <div className="flex gap-3"><button disabled={busy||!canSubmit||!assignment.positionId} className={buttonClass}>{busy?'Saving…':mode==='create'?'Save Employee':'Save Assignment'}</button><button type="button" disabled={busy} onClick={()=>{setMode(null);setIdentity(i=>({...i,pinCode:''}));}}>Cancel</button></div>
    </form>}
  </section>;
}

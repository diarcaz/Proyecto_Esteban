'use client';
import { Eye, EyeOff } from 'lucide-react';
import { recommendedPermissions, passwordRequirements } from '@/lib/admin-account-ux';
import { displayLabel } from '@/lib/display-labels';
import { useEffect, useRef, useState } from 'react';
import { adminAccountsApi } from '@/lib/api-client';
import { useAuthStore } from '@/store/use-auth-store';
import { canOpenAdminRoute } from '@/lib/admin-access';
const fresh = () => ({ firstName: '', lastName: '', email: '', role: 'MANAGER', companyId: '', status: 'ACTIVE', grants: [] as any[] });
export default function AccessUsers() {
    const { user, token } = useAuthStore(), scope = JSON.stringify([user, token]);
    const current = useRef(scope);
    current.current = scope;
    const [catalog, setCatalog] = useState<any>(null), [rows, setRows] = useState<any[]>([]), [form, setForm] = useState<any>(null), [password, setPassword] = useState(''), [reset, setReset] = useState<any>(null), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
    const [showPassword, setShowPassword] = useState(false), [roleChoice, setRoleChoice] = useState(false), [pendingPreset, setPendingPreset] = useState<any[] | null>(null);
    const allowed = canOpenAdminRoute(user, '/admin/access');
    async function refresh() { const [c, r] = await Promise.all([adminAccountsApi.catalog(), adminAccountsApi.list()]); if (current.current === scope) {
        setCatalog(c);
        setRows(r);
    } }
    useEffect(() => { setCatalog(null); setRows([]); setForm(null); setReset(null); setPassword(''); setShowPassword(false); setRoleChoice(false); setPendingPreset(null); setError(''); setNotice(''); setBusy(false); if (allowed)
        refresh().catch(() => { if (current.current === scope)
            setError('Account administration unavailable.'); }); return () => { current.current = ''; }; }, [scope, allowed]);
    if (!allowed)
        return <p role="alert">Access denied: account administration permission required.</p>;
    const field = 'w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm';
    const cancel = () => { setForm(null); setReset(null); setPassword(''); setShowPassword(false); setRoleChoice(false); setPendingPreset(null); setError(''); };
    async function submit(event: React.FormEvent) { event.preventDefault(); setBusy(true); setError(''); setNotice(''); const credential = password; setPassword(''); setShowPassword(false); setRoleChoice(false); setPendingPreset(null); try {
        if (reset)
            await adminAccountsApi.reset(reset.id, credential, reset.version);
        else if (form.id)
            await adminAccountsApi.update(form.id, { firstName: form.firstName, lastName: form.lastName, email: form.email, role: form.role, companyId: form.companyId, status: form.status, grants: form.grants, version: form.version });
        else
            await adminAccountsApi.create({ ...form, password: credential });
        if (current.current !== scope)
            return;
        setForm(null);
        setReset(null);
        setNotice(reset ? 'Password updated. Share it securely with the account holder.' : form.status === 'TERMINATED' ? 'Account deactivated. New authenticated requests are blocked.' : form.id ? 'Account changes saved.' : 'Admin account created.');
        await refresh();
    }
    catch (e: any) {
        if (current.current === scope)
            setError(e.message || 'Unable to save account.');
    }
    finally {
        if (current.current === scope)
            setBusy(false);
    } }
    function edit(row: any) { setReset(null); setPassword(''); setShowPassword(false); setRoleChoice(false); setPendingPreset(null); setError(''); const grants = [...new Set<string>([...row.legacyPropertyIds, ...row.grants.map((g: any) => g.propertyId)])].map(id => ({ propertyId: id, permissions: [...new Set([...(row.globalPermissions || []), ...(row.grants.find((g: any) => g.propertyId === id)?.permissions || [])])] })); setForm({ ...row, grants }); }
    function changeRole(role: string) {
        setPendingPreset(null); setPassword(''); setShowPassword(false);
        if (form.id) { setForm({ ...form, role }); setRoleChoice(true); }
        else { setForm({ ...form, role, grants: role === 'OWNER' ? [] : form.grants.map((g: any) => ({ ...g, permissions: recommendedPermissions(role, form.companyId, g.propertyId, catalog, false) })) }); }
    }
    function applyPreset(grants: any[]) { setForm({ ...form, grants }); setRoleChoice(false); setPendingPreset(null); }
    function proposePreset(propertyId?: string) {
        const grants = form.grants.map((g: any) => propertyId && g.propertyId !== propertyId ? g : { ...g, permissions: recommendedPermissions(form.role, form.companyId, g.propertyId, catalog, !!form.id) });
        if (form.grants.some((g: any, i: number) => g.permissions.some((p: string) => !grants[i].permissions.includes(p)))) setPendingPreset(grants);
        else applyPreset(grants);
    }
    function toggleBranch(id: string) { setPendingPreset(null); setForm({ ...form, grants: form.grants.some((g: any) => g.propertyId === id) ? form.grants.filter((g: any) => g.propertyId !== id) : [...form.grants, { propertyId: id, permissions: form.id ? [] : recommendedPermissions(form.role, form.companyId, id, catalog, false) }] }); }
    function togglePermission(id: string, permission: string) { setPendingPreset(null); setForm({ ...form, grants: form.grants.map((g: any) => g.propertyId !== id ? g : { ...g, permissions: g.permissions.includes(permission) ? g.permissions.filter((p: string) => p !== permission) : [...g.permissions, permission] }) }); }
    return <section className="space-y-5"><header><p className="eyebrow">Administrative access</p><h2 className="page-title">Access & Users</h2><p className="text-sm text-slate-400">Manage administrative accounts across your authorized company and branches. Staff use the clock to record time. Admin accounts manage branches and review attendance. Add Staff in Staff Directory.</p></header>
 {catalog?.canCreate && <button className="rounded-xl bg-blue-600 px-4 py-3" onClick={() => { cancel(); setForm({ ...fresh(), role: catalog.roles.includes('MANAGER') ? 'MANAGER' : catalog.roles[0], companyId: catalog.companies.length === 1 ? catalog.companies[0].id : '' }); }}>+ Add Admin Account</button>}
 {error && <p role="alert" className="text-rose-300">{error}</p>}{notice && <p role="status" className="text-emerald-300">{notice}</p>}
 {(form || reset) && <form onSubmit={submit} className="panel p-5 space-y-4"><h3 className="font-semibold">{reset ? 'Set temporary password' : form.id ? 'Edit admin account' : 'New admin account'}</h3>
 {form && <><div className="grid md:grid-cols-2 gap-4">{['firstName', 'lastName', 'email'].map(key => <label key={key}>{key === 'firstName' ? 'First name' : key === 'lastName' ? 'Last name' : 'Email'}<input aria-label={key} type={key === 'email' ? 'email' : 'text'} required maxLength={key === 'email' ? 254 : 100} disabled={key === 'email' && !!form.id} className={field} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })}/></label>)}<label>Role<select aria-label="Account role" className={field} value={form.role} onChange={e => changeRole(e.target.value)}>{catalog.roles.map((r: string) => <option key={r} value={r}>{displayLabel(r)}</option>)}</select></label><label>Company<select aria-label="Account company" required disabled={!!form.id} className={field} value={form.companyId} onChange={e => { setForm({ ...form, companyId: e.target.value, grants: [] }); setPassword(''); setShowPassword(false); setPendingPreset(null); }}><option value="">Select company</option>{catalog.companies.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Status<select aria-label="Account status" className={field} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}><option value="ACTIVE">Active</option><option value="TERMINATED">Inactive</option></select></label></div>
 {form.role === 'OWNER' && <p>An Owner has full access to branches within their company. Branch presets do not limit this existing role scope.</p>}
 {roleChoice && <div className="rounded-lg border border-slate-700 p-3 space-y-2"><p>Role changed. Apply recommended permissions for {displayLabel(form.role)}?</p><div className="flex flex-wrap gap-2"><button type="button" disabled={busy} className="admin-secondary-button rounded-lg border px-3 py-2 text-sm" onClick={() => proposePreset()}>Apply recommended permissions</button><button type="button" disabled={busy} className="admin-secondary-button rounded-lg border px-3 py-2 text-sm" onClick={() => { setRoleChoice(false); setPendingPreset(null); }}>Keep current permissions</button></div></div>}
 {pendingPreset && <div role="group" aria-label="Confirm permission replacement" className="rounded-lg border border-slate-700 p-3 space-y-2"><p>This replaces selected permissions and removes choices outside the recommendation. Changes are only saved when you press Save account.</p><div className="flex flex-wrap gap-2"><button type="button" disabled={busy} className="admin-secondary-button rounded-lg border px-3 py-2" onClick={() => applyPreset(pendingPreset)}>Confirm replacement</button><button type="button" disabled={busy} className="admin-secondary-button rounded-lg border px-3 py-2" onClick={() => setPendingPreset(null)}>Cancel replacement</button></div></div>}
 {(form.role !== 'OWNER' || form.id) && <fieldset className="space-y-3"><legend className="font-semibold">Authorized branches and permissions</legend><p className="text-sm text-slate-400">Choose what this account can do at each branch. Viewing attendance includes time exports. Rate visibility requires separate permission.</p>{catalog.properties.filter((p: any) => p.companyId === form.companyId && (form.id ? p.canEdit : p.canCreate)).map((p: any) => { const grant = form.grants.find((g: any) => g.propertyId === p.id); return <div className="rounded-lg border border-slate-700 p-3" key={p.id}><label><input type="checkbox" checked={!!grant} onChange={() => toggleBranch(p.id)}/> {p.name}</label>{grant && <><button type="button" disabled={busy} className="admin-secondary-button rounded-lg border px-3 py-2 text-xs mt-2" onClick={() => proposePreset(p.id)}>Use recommended permissions</button><div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-3">{p.permissions.map((permission: string) => <label className="text-xs" key={permission}><input type="checkbox" checked={grant.permissions.includes(permission)} onChange={() => togglePermission(p.id, permission)}/> {displayLabel(permission)}</label>)}</div></>}</div>; })}</fieldset>}</>}
 {(reset || !form?.id) && <div><label htmlFor="temporary-password" className="block">Temporary password</label><input id="temporary-password" aria-label="Temporary password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" required minLength={16} maxLength={72} className={field} aria-describedby="temporary-password-help" value={password} onChange={e => setPassword(e.target.value)}/><button type="button" disabled={busy} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} className="admin-secondary-button inline-flex items-center gap-2 rounded-lg border px-3 py-2 mt-2" onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff aria-hidden="true" size={16}/> : <Eye aria-hidden="true" size={16}/>}<span>{showPassword ? 'Hide password' : 'Show password'}</span></button><span id="temporary-password-help" className="block text-xs text-slate-400">16+ characters; upper/lowercase, number and symbol. Never displayed again after saving. No automatic first-login password change is enforced.</span><ul className="grid gap-1 sm:grid-cols-2 text-xs mt-2" aria-label="Password requirements">{passwordRequirements(password).map(rule => <li key={rule.label} className={rule.met ? 'text-emerald-400' : 'text-slate-400'}>{rule.met ? '✓ Met: ' : '○ Needed: '}{rule.label}</li>)}</ul><p className="text-xs text-slate-400">Avoid common passwords and predictable sequences. The server checks this when you save; composition checks alone do not guarantee acceptance.</p></div>}
 {reset && <p className="text-sm text-slate-400">Resetting {reset.email}. Previous access and refresh credentials are invalidated by password reset.</p>}
 <p className="text-sm text-slate-400">{reset ? 'Save to replace this account’s password.' : form?.status === 'TERMINATED' ? 'Saving will deactivate this account and block further access.' : 'Review the role and authorized branches before saving.'}</p><div className="flex gap-3"><button disabled={busy || roleChoice || !!pendingPreset} className="rounded-lg bg-blue-600 p-3">{busy ? 'Saving…' : 'Save account'}</button><button type="button" disabled={busy} onClick={cancel}>Cancel</button></div></form>}
 <div className="panel overflow-x-auto"><table className="w-full text-sm"><thead><tr>{['Name', 'Email', 'Role', 'Company', 'Authorized branches', 'Status', 'Actions'].map(h => <th className="p-3 text-left" key={h}>{h}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.id} className="border-t border-slate-800"><td className="p-3">{row.firstName} {row.lastName}</td><td>{row.email}</td><td>{displayLabel(row.role)}</td><td>{row.companyName}</td><td>{row.companyWide ? 'All company branches' : [...new Set([...row.grants.map((g: any) => g.name), ...row.legacyPropertyIds.filter((id: string) => !row.grants.some((g: any) => g.propertyId === id)).map((id: string) => catalog?.properties.find((p: any) => p.id === id)?.name || 'Existing grant')])].join(', ') || 'No specific branches'}<details><summary>Permissions</summary>{row.companyWide || row.role === 'SUPER_ADMIN' ? <p>Full access within role scope.</p> : <>{row.globalPermissions.length > 0 && <p>Permissions across assigned branches: {row.globalPermissions.map(displayLabel).join(', ')}</p>}{row.grants.map((g: any) => <p key={g.propertyId}>{g.name}: {g.permissions.map(displayLabel).join(', ') || 'No permissions selected'}</p>)}</>}</details></td><td>{row.status === 'ACTIVE' ? 'Active' : 'Inactive'}</td><td>{row.canEdit && <button className="p-2 underline" onClick={() => edit(row)}>Edit</button>}{row.canReset && <button className="p-2 underline" onClick={() => { cancel(); setReset(row); }}>Reset password</button>}{!row.canEdit && !row.canReset && 'Read only'}</td></tr>)}</tbody></table>{!catalog && !error && <p role="status" className="p-4">Loading admin accounts…</p>}{catalog && rows.length === 0 && <p className="p-4">No admin accounts to manage in your authorized branches.</p>}</div></section>;
}

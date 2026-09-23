'use client';
import { useEffect, useRef, useState } from 'react';
import { periodApprovalApi } from '@/lib/api-client';

// Parent keys this component by authenticated Branch scope, discarding stale loads.
export function BranchApprovalPolicy({ locationId, onChanged }: { locationId: string; onChanged: () => Promise<void> }) {
    const [required, setRequired] = useState<boolean | null>(null);
    const [busy, setBusy] = useState(true), [error, setError] = useState('');
    const active = useRef(true);
    async function read() {
        const value = await periodApprovalApi.getPolicy(locationId);
        if (typeof value.requireApproval !== 'boolean') throw new Error('Invalid policy response');
        if (active.current) setRequired(value.requireApproval);
    }
    useEffect(() => {
        active.current = true;
        void read().catch(() => { if (active.current) setError('Unable to load branch approval policy.'); })
            .finally(() => { if (active.current) setBusy(false); });
        return () => { active.current = false; };
    }, [locationId]);
    async function save(value: boolean) {
        setBusy(true); setError('');
        try {
            await periodApprovalApi.policy(locationId, value);
            await read();
            if (active.current) await onChanged();
        } catch {
            if (active.current) { setRequired(null); setError('Unable to confirm branch approval policy. Reload the policy before retrying.'); }
        } finally { if (active.current) setBusy(false); }
    }
    return <div className="space-y-2">
        <label className="flex items-center gap-2"><input type="checkbox" checked={required === true} disabled={busy || required === null} onChange={e => void save(e.target.checked)}/>Require approval before finalizing hours</label>
        <p role="status">{busy ? 'Loading or saving branch policy…' : required === null ? 'Approval policy unavailable' : required ? 'ON — approval is required.' : 'OFF — review and export hours without mandatory approval.'}</p>
        <p className="text-sm text-slate-400">Changing this branch policy invalidates existing final reviews and preserves their history.</p>
        {error && <><p role="alert">{error}</p><button disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await read(); } catch { if (active.current) setError('Unable to load branch approval policy.'); } finally { if (active.current) setBusy(false); } }}>Reload policy</button></>}
    </div>;
}

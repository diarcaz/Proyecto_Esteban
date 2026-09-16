'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { locationsApi } from '@/lib/api-client';
import { useAuthReady } from '@/store/use-auth-ready';
import { useAuthStore } from '@/store/use-auth-store';
import { can, isAdminRole } from '@/lib/admin-access';
import { terminalFromProperty, TerminalConfig } from '@/lib/clock-context';

export default function ClockSetupPage() {
  const { isAuthenticated, user } = useAuthStore();
  const ready = useAuthReady();
  const router = useRouter();
  const [properties, setProperties] = useState<TerminalConfig[]>([]);
  const [selected, setSelected] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const authorized = ready && isAuthenticated && isAdminRole(user?.role) && can(user, 'PROPERTY_VIEW');
  useEffect(() => {
    let active = true;
    setProperties([]); setSelected(''); setConfirmed(false); setError('');
    if (!authorized) return;
    setLoading(true);
    locationsApi.list().then(data => {
      if (active) setProperties(data.map(terminalFromProperty));
    }).catch(e => { if (active) setError(e.message || 'Properties unavailable.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [authorized, user?.id]);
  function save(e: React.FormEvent) {
    e.preventDefault();
    const property = properties.find(p => p.propertyId === selected);
    if (!authorized || !confirmed || !property) return;
    try {
      localStorage.setItem('kiosk_terminal_config', JSON.stringify({ ...property, pairedAt: new Date().toISOString() }));
      router.push('/clock');
    } catch { setError('Unable to save terminal configuration.'); }
  }
  return <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
    <div className="w-full max-w-xl rounded-3xl border border-slate-700 bg-slate-900 p-8 shadow-xl space-y-5">
      <h1 className="text-2xl font-black">Pair your tablet kiosk</h1>
      {!ready ? <p role="status">Loading session…</p> : !isAuthenticated ? <p>Administrator sign-in is required. <Link className="text-blue-300 underline" href="/admin/login">Sign in</Link></p>
        : !authorized ? <p role="alert">Access Denied: PROPERTY_VIEW permission is required.</p>
        : <form onSubmit={save} className="space-y-5">
          <p>Choose the branch where this tablet will be used, then confirm to launch the kiosk.</p>
          {loading && <p>Loading authorized properties…</p>}
          {!loading && !properties.length && <p>No authorized properties available.</p>}
          {properties.map(property => <label key={property.propertyId} className="flex gap-3 p-4 border border-slate-700 bg-slate-950 rounded-xl cursor-pointer">
            <input type="radio" name="property" value={property.propertyId} checked={selected === property.propertyId}
              onChange={() => { setSelected(property.propertyId); setConfirmed(false); }} />
            <span>{property.propertyName} ({property.locationCode})<small className="block">{property.timezone}</small></span>
          </label>)}
          <label className="flex gap-3"><input type="checkbox" disabled={!selected} checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />I confirm this is the terminal's property.</label>
          <button disabled={!selected || !confirmed || loading} className="w-full rounded-xl bg-blue-700 text-white p-4 disabled:opacity-40">Confirm pairing & launch kiosk</button>
        </form>}
      {error && <p role="alert" className="text-rose-300">{error}</p>}
      <Link href="/clock" className="text-blue-300 underline">Back to clock</Link>
    </div>
  </main>;
}

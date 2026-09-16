'use client';
import React, { useEffect } from 'react';
import { useLocationStore } from '@/store/use-location-store';
import { useAuthStore } from '@/store/use-auth-store';
import { can } from '@/lib/admin-access';
export function LocationSwitcher() {
  const { locations, fetchLocations, selectedLocationId, setSelectedLocationId } = useLocationStore();
  const { user } = useAuthStore();
  const permitted = can(user, 'PROPERTY_VIEW');
  useEffect(() => { if (permitted) fetchLocations(); }, [permitted, user?.id, fetchLocations]);
  if (!permitted) return null;
  return <label className="text-xs min-w-0"><span className="sr-only">Branch</span><select aria-label="Admin property" className="max-w-full bg-slate-950 text-slate-200 px-3 py-2 border border-slate-700 rounded-xl" value={selectedLocationId} onChange={e => setSelectedLocationId(e.target.value)}>
    <option value="ALL">{user?.role === 'SUPER_ADMIN' ? 'All Authorized Branches' : 'My Authorized Branches'}</option>
    {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name} ({loc.code})</option>)}
  </select></label>;
}

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
  return <label className="text-xs">Property <select aria-label="Admin property" className="bg-slate-900 p-2 border rounded-lg" value={selectedLocationId} onChange={e => setSelectedLocationId(e.target.value)}>
    <option value="ALL">All authorized properties</option>
    {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name} ({loc.code})</option>)}
  </select></label>;
}

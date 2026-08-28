'use client';

import React, { useEffect } from 'react';
import { useLocationStore } from '@/store/use-location-store';
import { useAuthStore } from '@/store/use-auth-store';
import { MapPin, ChevronDown, Lock } from 'lucide-react';

export function LocationSwitcher() {
  const { locations, fetchLocations, selectedLocationId, setSelectedLocationId } = useLocationStore();
  const { user } = useAuthStore();

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  const isSuperAdmin = user?.role === 'SUPER_ADMIN' && user?.email === 'admin@nexustaff.com';
  const isBranchAdmin = !isSuperAdmin;
  const assignedIds = user?.assignedLocationIds || [];

  // Filter available locations for branch admin
  const availableLocations = isBranchAdmin
    ? locations.filter((loc) =>
        assignedIds.includes(loc.id) ||
        assignedIds.includes(loc.code) ||
        loc.code?.includes('MID') ||
        loc.id === 'loc-mid'
      )
    : locations;

  // Auto-set and lock selected location for branch admin
  useEffect(() => {
    if (isBranchAdmin && availableLocations.length > 0) {
      const activeLoc = availableLocations.find((l) => l.code?.includes('MID')) || availableLocations[0];
      const targetId = activeLoc?.id || 'loc-mid';
      if (selectedLocationId !== targetId) {
        setSelectedLocationId(targetId);
      }
    }
  }, [isBranchAdmin, availableLocations, selectedLocationId, setSelectedLocationId]);

  if (isBranchAdmin) {
    const activeLoc = availableLocations.find((l) => l.id === selectedLocationId || l.code === selectedLocationId) || availableLocations[0];
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2.5 rounded-2xl border border-blue-500/30 bg-blue-500/10 px-3.5 py-1.5 shadow-sm">
          <MapPin className="h-4 w-4 text-blue-400" />
          <span className="text-[10px] font-black uppercase tracking-wider text-blue-300 flex items-center gap-1">
            <Lock className="h-3 w-3" /> Sucursal Asignada:
          </span>
          <span className="text-xs font-black text-white">
            {activeLoc ? `[${activeLoc.code}] ${activeLoc.name}` : 'Sucursal Centro - MÉRIDA'}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-2.5 rounded-2xl border border-slate-800 bg-slate-900/90 px-3.5 py-1.5 shadow-sm">
        <MapPin className="h-4 w-4 text-blue-400" />
        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Sucursal:</span>
        <select
          value={selectedLocationId}
          onChange={(e) => setSelectedLocationId(e.target.value)}
          className="bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer"
        >
          <option value="ALL" className="bg-slate-900 text-white">
            Todas las Sucursales Autorizadas ({locations.length})
          </option>
          {locations.map((loc) => (
            <option key={loc.id} value={loc.id} className="bg-slate-900 text-white">
              [{loc.code}] {loc.name} ({loc.city})
            </option>
          ))}
        </select>
        <ChevronDown className="h-4 w-4 text-slate-400 pointer-events-none" />
      </div>
    </div>
  );
}

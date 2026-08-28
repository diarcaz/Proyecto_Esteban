'use client';

import React from 'react';
import { useLocationStore, isLocationMatching } from '@/store/use-location-store';
import { usePunchStore } from '@/store/use-punch-store';
import { Clock } from 'lucide-react';

export function ShiftActivityTimeline() {
  const { selectedLocationId } = useLocationStore();
  const { punches } = usePunchStore();

  const activePunches = punches.filter((p) =>
    isLocationMatching(p.locationId, p.locationCode, selectedLocationId) && Boolean(p.actualIn)
  );

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl space-y-4 font-sans">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-blue-400" />
          <h3 className="text-sm font-extrabold text-white">Live Shift Activity Timeline</h3>
        </div>
        <span className="text-[10px] font-black uppercase text-emerald-400 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 animate-pulse">
          Live NexuStaff Engine
        </span>
      </div>

      {activePunches.length === 0 ? (
        <div className="p-6 text-center text-slate-500 font-medium text-xs">
          No hay actividad de marcaje activa registrada hoy en esta sucursal.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {activePunches.map((punch) => {
            const isLate = punch.status === 'LATE';
            const isOt = punch.isOvertime || punch.status === 'OVERTIME';
            const badgeColor = isLate
              ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
              : isOt
              ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
              : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';

            const statusText = isLate ? 'RETARDO' : isOt ? 'HORA EXTRA' : 'EN TURNO';

            return (
              <div key={punch.id} className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2 hover:border-blue-500/40 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-full bg-blue-600/20 text-blue-300 font-bold text-xs flex items-center justify-center border border-blue-500/30">
                      {punch.employeeName.charAt(0)}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-white leading-tight">{punch.employeeName}</span>
                      <span className="text-[10px] text-slate-400 font-mono">#{punch.employeeNumber} &bull; {punch.jobPositionCode}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] pt-1">
                  <span className="text-slate-400 font-medium">Entrada: {punch.actualIn || punch.scheduledIn}</span>
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border uppercase ${badgeColor}`}>
                    {statusText}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

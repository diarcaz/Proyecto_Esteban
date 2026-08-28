'use client';

import React, { useState } from 'react';
import { usePunchStore } from '@/store/use-punch-store';
import { useLocationStore, isLocationMatching } from '@/store/use-location-store';
import { formatHours } from '@/lib/utils';
import { PunchMock } from '@/lib/mock-data';
import { exportPunchesToCsv } from '@/lib/csv-exporter';
import { ShiftDetailModal } from './shift-detail-modal';
import { CheckCircle, AlertCircle, Clock, Utensils, ExternalLink, FileSpreadsheet, ShieldCheck } from 'lucide-react';

export function PunchesTable() {
  const { punches, searchQuery, selectedPosition, activeFilterTab } = usePunchStore();
  const { selectedLocationId } = useLocationStore();
  const [selectedPunch, setSelectedPunch] = useState<PunchMock | null>(null);

  const filteredPunches = punches.filter((p) => {
    // Location Filter
    if (!isLocationMatching(p.locationId, p.locationCode, selectedLocationId)) {
      return false;
    }
    // Position Filter
    if (selectedPosition !== 'ALL' && p.jobPositionCode !== selectedPosition) {
      return false;
    }
    // Search Query Filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchName = p.employeeName.toLowerCase().includes(q);
      const matchEmpNo = p.employeeNumber.toLowerCase().includes(q);
      if (!matchName && !matchEmpNo) return false;
    }
    // Tab Filter
    if (activeFilterTab === 'ON_SHIFT') {
      return Boolean(p.actualIn && !p.actualOut);
    }
    if (activeFilterTab === 'LATE') {
      return p.status === 'LATE';
    }
    if (activeFilterTab === 'OVERTIME') {
      return p.isOvertime || p.status === 'OVERTIME';
    }

    return true;
  });

  return (
    <>
      <div className="flex justify-end mb-3 font-sans">
        <button
          onClick={() => exportPunchesToCsv(filteredPunches)}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-extrabold text-white shadow-lg transition-all active:scale-95 cursor-pointer"
        >
          <FileSpreadsheet className="h-4 w-4" /> Export to CSV
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-xl font-sans">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-800">
              <tr>
                <th className="px-4 py-3.5">Trabajador</th>
                <th className="px-4 py-3.5">Emp #</th>
                <th className="px-4 py-3.5">Puesto (JC_POS)</th>
                <th className="px-4 py-3.5">Sucursal (JC_LOC)</th>
                <th className="px-4 py-3.5">Sched In vs Actual In</th>
                <th className="px-4 py-3.5">Sched Out vs Actual Out</th>
                <th className="px-4 py-3.5 text-center">Horario Receso / Almuerzo</th>
                <th className="px-4 py-3.5 text-right">Net Hours</th>
                <th className="px-4 py-3.5 text-center">NexuStaff Status</th>
                <th className="px-4 py-3.5 text-center">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredPunches.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-slate-500 font-semibold">
                    No time punch records match the selected filter criteria.
                  </td>
                </tr>
              ) : (
                filteredPunches.map((punch) => (
                  <tr
                    key={punch.id}
                    onClick={() => setSelectedPunch(punch)}
                    className="hover:bg-slate-800/60 transition-colors cursor-pointer group"
                  >
                    <td className="px-4 py-3 font-bold text-white flex items-center gap-2">
                      <div className="h-7 w-7 rounded-full bg-blue-600/20 text-blue-300 font-extrabold flex items-center justify-center text-xs border border-blue-500/30">
                        {punch.employeeName.charAt(0)}
                      </div>
                      <span className="group-hover:text-blue-400 transition-colors">{punch.employeeName}</span>
                    </td>

                    <td className="px-4 py-3 font-mono text-slate-400">{punch.employeeNumber}</td>

                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-lg bg-blue-500/10 px-2.5 py-1 text-[11px] font-bold text-blue-400 border border-blue-500/20">
                        {punch.jobPositionCode}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-slate-300 font-semibold">
                      {punch.locationCode}
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="text-[10px] text-slate-400">Sched: {punch.scheduledIn}</span>
                        <span
                          className={`font-bold ${
                            punch.status === 'LATE' ? 'text-amber-400' : 'text-white'
                          }`}
                        >
                          Actual: {punch.actualIn || 'Not Clocked'}
                        </span>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="text-[10px] text-slate-400">Sched: {punch.scheduledOut}</span>
                        <span className="font-bold text-white">
                          Actual: {punch.actualOut || <span className="text-emerald-400 animate-pulse font-extrabold">ON SHIFT (ACTIVE)</span>}
                        </span>
                      </div>
                    </td>

                    {/* LUNCH / BREAK TIME DISPLAY COLUMN */}
                    <td className="px-4 py-3 text-center font-mono text-[11px]">
                      {punch.lunchStart && punch.lunchEnd ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 font-bold text-amber-300 border border-amber-500/30">
                          <Utensils className="h-3 w-3" /> {punch.lunchStart} - {punch.lunchEnd}
                        </span>
                      ) : punch.lunchStart ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2.5 py-0.5 font-extrabold text-amber-400 border border-amber-500/40 animate-pulse">
                          <Utensils className="h-3 w-3" /> En Almuerzo ({punch.lunchStart})
                        </span>
                      ) : (
                        <span className="text-slate-500 font-medium">--</span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-right font-mono text-sm font-black text-white">
                      {formatHours(punch.calculatedHours)}
                    </td>

                    <td className="px-4 py-3 text-center">
                      {punch.isOvertimeApproved ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-3 py-1 text-[10px] font-black text-emerald-400 border border-emerald-500/40">
                          <ShieldCheck className="h-3.5 w-3.5" /> OT APPROVED
                        </span>
                      ) : punch.status === 'ON_TIME' ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-3 py-1 text-[10px] font-black text-emerald-400 border border-emerald-500/30">
                          <CheckCircle className="h-3.5 w-3.5" /> ON_TIME
                        </span>
                      ) : punch.status === 'LATE' ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-3 py-1 text-[10px] font-black text-amber-400 border border-amber-500/30">
                          <Clock className="h-3.5 w-3.5" /> LATE
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-3 py-1 text-[10px] font-black text-rose-400 border border-rose-500/30">
                          <AlertCircle className="h-3.5 w-3.5" /> OVERTIME
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-center">
                      <button className="p-1 rounded-lg bg-slate-800 hover:bg-blue-600 text-slate-400 hover:text-white transition-colors">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Interactive Shift Detail Modal */}
      <ShiftDetailModal punch={selectedPunch} onClose={() => setSelectedPunch(null)} />
    </>
  );
}

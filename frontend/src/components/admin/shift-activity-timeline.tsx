'use client';

import React, { useState, useEffect } from 'react';
import { MOCK_EMPLOYEES, EmployeeMock } from '@/lib/mock-data';
import { useLocationStore, isLocationMatching } from '@/store/use-location-store';
import { staffApi } from '@/lib/api-client';
import { Clock } from 'lucide-react';

export function ShiftActivityTimeline() {
  const { selectedLocationId } = useLocationStore();
  const [allStaff, setAllStaff] = useState<EmployeeMock[]>(MOCK_EMPLOYEES);

  useEffect(() => {
    async function loadStaff() {
      try {
        const data = await staffApi.list();
        if (Array.isArray(data) && data.length > 0) {
          const mapped: EmployeeMock[] = data.map((item: any) => ({
            id: item.id,
            employeeNumber: item.employeeNumber || 'EMP-000',
            firstName: item.firstName || '',
            lastName: item.lastName || '',
            jobPositionCode: item.jobPositionCode || 'STAFF',
            locationId: item.assignments?.[0]?.locationId || item.locationId || 'loc-mid',
            locationCode: item.assignments?.[0]?.location?.locationCode || item.locationCode || 'MID-1001',
            pinCode: item.pinCode || '',
            preferredLanguage: item.preferredLanguage || 'es',
          }));
          setAllStaff(mapped);
        }
      } catch (e) {}
    }
    loadStaff();
  }, []);

  const activeStaff = allStaff
    .filter((emp) => {
      if (emp.jobPositionCode === 'SUPER_ADMIN' || emp.employeeNumber?.startsWith('ADM-')) {
        return false;
      }
      return isLocationMatching(emp.locationId, emp.locationCode, selectedLocationId);
    })
    .slice(0, 4);

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

      {activeStaff.length === 0 ? (
        <p className="text-xs text-slate-500 text-center py-4">No active staff found for the selected branch.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {activeStaff.map((emp, idx) => {
            const statuses = ['ON SHIFT', 'ON BREAK', 'ON TIME', 'ON SHIFT'];
            const status = statuses[idx % statuses.length];
            const badgeColor =
              status === 'ON SHIFT'
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : status === 'ON BREAK'
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                : 'bg-blue-500/10 text-blue-400 border-blue-500/30';

            return (
              <div key={emp.id} className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2 hover:border-blue-500/40 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-full bg-blue-600/20 text-blue-300 font-bold text-xs flex items-center justify-center border border-blue-500/30">
                      {emp.firstName.charAt(0)}{emp.lastName.charAt(0)}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-white leading-tight">{emp.firstName} {emp.lastName}</span>
                      <span className="text-[10px] text-slate-400 font-mono">#{emp.employeeNumber} &bull; {emp.jobPositionCode}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] pt-1">
                  <span className="text-slate-400 font-medium">Shift: 08:00 AM</span>
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border uppercase ${badgeColor}`}>
                    {status}
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

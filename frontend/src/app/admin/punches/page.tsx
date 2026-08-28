import React from 'react';
import { PunchFilters } from '@/components/punches/punch-filters';
import { PunchesTable } from '@/components/punches/punches-table';

export default function TimePunchesPage() {
  return (
    <div className="space-y-6 font-sans">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-white">Live Attendance Logs &amp; Time Clock</h2>
          <p className="text-xs text-slate-400 font-medium">
            Time punch log comparing Scheduled vs Actual clock times, lunch duration, and net hours.
          </p>
        </div>
      </div>

      <PunchFilters />
      <PunchesTable />
    </div>
  );
}

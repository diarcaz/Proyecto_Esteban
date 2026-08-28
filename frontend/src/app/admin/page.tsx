'use client';

import React, { useEffect } from 'react';
import { MetricsCards } from '@/components/admin/metrics-cards';
import { ShiftActivityTimeline } from '@/components/admin/shift-activity-timeline';
import { PunchesTable } from '@/components/punches/punches-table';
import { usePunchStore } from '@/store/use-punch-store';
import { useLocationStore } from '@/store/use-location-store';

export default function AdminOverviewPage() {
  const { fetchPunches } = usePunchStore();
  const { selectedLocationId } = useLocationStore();

  useEffect(() => {
    fetchPunches(selectedLocationId);
    const timer = setInterval(() => {
      fetchPunches(selectedLocationId);
    }, 3000);
    return () => clearInterval(timer);
  }, [fetchPunches, selectedLocationId]);

  return (
    <div className="space-y-6 font-sans">
      <div>
        <h2 className="text-2xl font-black tracking-tight text-white">Live Operations Overview</h2>
        <p className="text-xs text-slate-400 font-medium">
          Real-time multi-branch staff monitoring, time punch performance, and shift coverage.
        </p>
      </div>

      <MetricsCards />

      <ShiftActivityTimeline />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-extrabold text-white">Live Attendance Punch Activity</h3>
          <span className="text-xs text-blue-400 font-bold flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
            </span>
            Direct Live Stream (NexuStaff Sync)
          </span>
        </div>
        <PunchesTable />
      </div>
    </div>
  );
}

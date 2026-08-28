'use client';

import React from 'react';
import { usePunchStore } from '@/store/use-punch-store';
import { Search, Filter, Calendar } from 'lucide-react';

export function PunchFilters() {
  const { searchQuery, setSearchQuery, selectedPosition, setSelectedPosition, activeFilterTab, setActiveFilterTab } = usePunchStore();

  return (
    <div className="space-y-4 mb-5 font-sans">
      {/* Quick Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3">
        {[
          { id: 'ALL', label: 'All Punches' },
          { id: 'ON_SHIFT', label: 'On Shift (Active)' },
          { id: 'LATE', label: 'Late Punches' },
          { id: 'OVERTIME', label: 'Overtime Shifts' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveFilterTab(tab.id as 'ALL' | 'ON_SHIFT' | 'LATE' | 'OVERTIME')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
              activeFilterTab === tab.id
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                : 'bg-slate-900/80 text-slate-400 hover:bg-slate-800 hover:text-white border border-slate-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filter Controls Row */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-xl">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by Staff Name or Emp #..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-slate-800 bg-slate-950 pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs">
            <Filter className="h-4 w-4 text-slate-400" />
            <span className="text-[10px] font-black text-slate-400 uppercase">Position:</span>
            <select
              value={selectedPosition}
              onChange={(e) => setSelectedPosition(e.target.value)}
              className="bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-slate-900">All Positions</option>
              <option value="SUPERVISOR" className="bg-slate-900">SUPERVISOR</option>
              <option value="RECEPT" className="bg-slate-900">RECEPT</option>
              <option value="IT_SPEC" className="bg-slate-900">IT_SPEC</option>
              <option value="OP_MNT" className="bg-slate-900">OP_MNT</option>
              <option value="CAJERO" className="bg-slate-900">CAJERO</option>
            </select>
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs">
            <Calendar className="h-4 w-4 text-slate-400" />
            <span className="text-[10px] font-black text-slate-400 uppercase">Pay Period:</span>
            <span className="font-bold text-white">Current Period (July 15 - July 31)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

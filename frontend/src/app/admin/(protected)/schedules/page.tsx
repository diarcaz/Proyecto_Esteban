'use client';
import { useState } from 'react';
import { useLocationStore } from '@/store/use-location-store';
import { CalendarDays, ChevronLeft, ChevronRight, LockKeyhole } from 'lucide-react';
export default function SchedulesPage() {
  const { selectedLocationId, locations } = useLocationStore();
  const [offset,setOffset]=useState(0);
  const monday=new Date(); monday.setHours(12,0,0,0); monday.setDate(monday.getDate()-(monday.getDay()+6)%7+offset*7);
  const days=Array.from({length:7},(_,i)=>{const date=new Date(monday);date.setDate(date.getDate()+i);return date;});
  const branch=locations.find(l=>l.id===selectedLocationId)?.name || 'Authorized branches';
  return <section className="space-y-6"><header><p className="eyebrow">Workforce planning</p><h2 className="page-title">Shift Schedules</h2><p className="text-sm text-slate-400">Weekly planning workspace · {branch}</p></header>
    <div className="panel p-5 flex items-start gap-3"><LockKeyhole className="text-amber-300 shrink-0" size={20}/><div><h3 className="font-semibold">Planner unavailable in this beta</h3><p className="text-sm text-slate-400 mt-1">Schedule loading, editing and publishing are not enabled here. This empty matrix does not represent staff availability or assigned shifts.</p></div></div>
    <div className="panel overflow-hidden"><div className="flex flex-wrap justify-between gap-3 p-4 border-b border-slate-800"><div className="flex gap-2 items-center font-semibold"><CalendarDays size={18} className="text-blue-400"/>{monday.toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}</div><div className="flex gap-3 items-center"><button aria-label="Previous week" onClick={()=>setOffset(v=>v-1)}><ChevronLeft size={20}/></button><button className="text-sm text-blue-300" onClick={()=>setOffset(0)}>This week</button><button aria-label="Next week" onClick={()=>setOffset(v=>v+1)}><ChevronRight size={20}/></button></div></div>
    <div className="overflow-x-auto"><table className="data-table min-w-[760px]"><thead><tr><th>Branch scope</th>{days.map(day=><th key={day.toISOString()}>{day.toLocaleDateString('en-US',{weekday:'short',day:'numeric'})}</th>)}</tr></thead><tbody><tr><td>{branch}</td>{days.map(day=><td key={day.toISOString()}><div className="h-40 flex items-center justify-center border border-dashed border-slate-700 rounded-lg text-slate-500 text-xs">Unavailable</div></td>)}</tr></tbody></table></div></div>
  </section>;
}

'use client';
import { PeriodReview } from './period-review';
import { PeriodExports } from './period-exports';
import Link from 'next/link';
import { useAuthStore } from '@/store/use-auth-store';
import { useLocationStore } from '@/store/use-location-store';
import { can } from '@/lib/admin-access';
import { FileBarChart, Download, LockKeyhole } from 'lucide-react';
export function ReportsView() {
  const {user}=useAuthStore(); const {selectedLocationId}=useLocationStore();
  const payroll=can(user,'VIEW_PAYROLL',selectedLocationId), invoices=can(user,'VIEW_INVOICES',selectedLocationId);
  if(!payroll && !invoices && !can(user,'TIME_VIEW',selectedLocationId)) return <p role="alert">Access Denied: financial reporting permission is required.</p>;
  return <section className="space-y-6"><header><p className="eyebrow">Reporting workspace</p><h2 className="page-title">Reports & Payroll</h2><p className="text-sm text-slate-400">Exports and reporting for your authorized branch scope.</p></header>
    <PeriodExports />
    <PeriodReview />
    <div className="grid md:grid-cols-2 gap-4">{[{show:payroll,title:'Payroll',description:'Final payroll values are unavailable in this screen. No estimated rates or browser-calculated totals are displayed.'},{show:invoices,title:'Invoices',description:'Authoritative invoice totals are not yet available in this screen.'}].filter(item=>item.show).map(item=><article key={item.title} className="panel p-6 space-y-4"><LockKeyhole className="text-slate-500"/><h3 className="font-semibold text-lg">{item.title}</h3><span className="status-badge">Unavailable</span><p className="text-sm text-slate-400">{item.description}</p><button disabled className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-500">Export unavailable</button></article>)}</div>
  </section>;
}

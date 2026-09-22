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
  if(!payroll && !invoices && !can(user,'TIME_VIEW',selectedLocationId)) return <p role="alert">Access Denied: time reporting permission is required.</p>;
  return <section className="space-y-6"><header><p className="eyebrow">Reporting workspace</p><h2 className="page-title">Time Reports</h2><p className="text-sm text-slate-400">Exports and reporting for your authorized branch scope.</p></header>
    <PeriodExports />
    <PeriodReview />
    <p className="text-sm text-slate-400">Review attendance, approve hours and download time records. Payroll processing and invoicing are not included.</p>
  </section>;
}

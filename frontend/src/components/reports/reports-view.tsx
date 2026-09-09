'use client';
import React from 'react';
import { useAuthStore } from '@/store/use-auth-store';
import { useLocationStore } from '@/store/use-location-store';
import { can } from '@/lib/admin-access';

export function ReportsView() {
  const { user } = useAuthStore();
  const { selectedLocationId } = useLocationStore();
  const payroll = can(user, 'VIEW_PAYROLL', selectedLocationId);
  const invoices = can(user, 'VIEW_INVOICES', selectedLocationId);
  if (!payroll && !invoices) return <p role="alert">Access Denied: financial reporting permission is required.</p>;
  return <section className="space-y-5"><h2 className="text-2xl font-bold">Reports</h2>
    {payroll && <div className="rounded-xl border border-slate-700 p-5"><h3 className="font-bold">Payroll</h3><p>Final payroll values are unavailable in this screen. No estimated rates or browser-calculated totals are displayed.</p></div>}
    {invoices && <div className="rounded-xl border border-slate-700 p-5"><h3 className="font-bold">Invoices</h3><p>Authoritative invoice totals are not yet available in this screen.</p></div>}
  </section>;
}

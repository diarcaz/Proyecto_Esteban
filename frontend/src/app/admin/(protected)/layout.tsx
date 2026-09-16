'use client';

import { canOpenAdminRoute, isAdminRole } from '@/lib/admin-access';
import { useLocationStore } from '@/store/use-location-store';
import React, { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthReady } from '@/store/use-auth-ready';
import { useAuthStore } from '@/store/use-auth-store';
import { Sidebar } from '@/components/admin/sidebar';
import { LocationSwitcher } from '@/components/admin/location-switcher';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { UserCircle, ShieldCheck, Loader2 } from 'lucide-react';

export default function AdminProtectedLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, user } = useAuthStore();
  const ready = useAuthReady();
  const { selectedLocationId } = useLocationStore();

  useEffect(() => {
    if (!ready) return;
    if (!isAuthenticated) {
      router.push('/admin/login');
      return;
    }

    if (!isAdminRole(user?.role)) {
      router.push('/admin/login');
      return;
    }

  }, [ready, isAuthenticated, user, pathname, router]);

  // Block rendering of admin interface completely if unauthenticated or worker
  if (!ready || !isAuthenticated || !isAdminRole(user?.role)) {
    return (
      <div className="min-h-screen w-full bg-slate-950 flex items-center justify-center font-sans text-slate-400">
        <div className="flex items-center gap-3 text-xs font-bold">
          <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
          <span>Verificando credenciales y redirigiendo a inicio de sesión...</span>
        </div>
      </div>
    );
  }

  const permitted = canOpenAdminRoute(user, pathname, selectedLocationId);

  return (
    <div className="flex h-screen w-full bg-slate-950 text-slate-100 overflow-hidden font-sans">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Top NexuStaff Header Bar */}
        <header className="flex flex-wrap min-h-20 shrink-0 gap-3 items-center justify-between border-b border-slate-800 bg-slate-900/70 px-4 py-3 print:hidden">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <h1 className="hidden xl:flex text-sm font-extrabold tracking-tight text-white items-center gap-2">
              NexuStaff
            </h1>
            <LocationSwitcher />
          </div>

          <div className="flex items-center gap-3">
            <NotificationBell />
            <div className="flex items-center gap-2.5 rounded-2xl border border-slate-800 bg-slate-950 px-3 py-1.5 shadow-md">
              <UserCircle className="h-5 w-5 text-blue-400" />
              <div className="flex flex-col text-left">
                <span className="text-xs font-extrabold text-white">{user?.name || 'Administrator'}</span>
                <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3" /> {user?.role || 'LOCATION_ADMIN'}
                </span>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-7 bg-slate-950 print:bg-white print:p-0 print:overflow-visible">{permitted ? children : <p role="alert">Access Denied: missing permission for this module.</p>}</main>
      </div>
    </div>
  );
}

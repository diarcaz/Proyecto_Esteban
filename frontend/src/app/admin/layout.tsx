'use client';

import React, { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/use-auth-store';
import { Sidebar } from '@/components/admin/sidebar';
import { LocationSwitcher } from '@/components/admin/location-switcher';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { UserCircle, ShieldCheck, Loader2 } from 'lucide-react';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, user } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated && pathname !== '/admin/login') {
      router.push('/admin/login');
      return;
    }

    // Role-Based Route Protection: LOCATION_ADMIN cannot access superadmin routes
    if (user && user.role === 'LOCATION_ADMIN') {
      if (pathname === '/admin/locations' || pathname === '/admin/settings') {
        router.push('/admin');
      }
    }
  }, [isAuthenticated, user, pathname, router]);

  // Don't wrap login page with sidebar layout
  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  // Block rendering of admin interface completely if unauthenticated
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen w-full bg-slate-950 flex items-center justify-center font-sans text-slate-400">
        <div className="flex items-center gap-3 text-xs font-bold">
          <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
          <span>Verificando credenciales y redirigiendo a inicio de sesión...</span>
        </div>
      </div>
    );
  }

  const isSuperAdmin = user?.role === 'SUPER_ADMIN' && user?.email === 'admin@nexustaff.com';

  return (
    <div className="flex h-screen w-full bg-slate-950 text-slate-100 overflow-hidden font-sans">
      <Sidebar />

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top NexuStaff Header Bar */}
        <header className="flex h-16 items-center justify-between border-b border-slate-800 bg-slate-900 px-6 print:hidden">
          <div className="flex items-center gap-4">
            <h1 className="text-sm font-extrabold tracking-tight text-white flex items-center gap-2">
              Staff Management <span className="text-[10px] text-blue-400 font-mono font-normal">v2.4</span>
            </h1>
            <LocationSwitcher />
          </div>

          <div className="flex items-center gap-3">
            <NotificationBell />
            <div className="flex items-center gap-2.5 rounded-2xl border border-slate-800 bg-slate-950 px-3.5 py-1.5 shadow-md">
              <UserCircle className="h-5 w-5 text-blue-400" />
              <div className="flex flex-col text-left">
                <span className="text-xs font-extrabold text-white">{user?.name || 'Usuario Administrador'}</span>
                <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3" /> {isSuperAdmin ? 'SUPER_ADMIN' : 'LOCATION_ADMIN'}
                </span>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 bg-slate-950 print:bg-white print:p-0 print:overflow-visible">{children}</main>
      </div>
    </div>
  );
}

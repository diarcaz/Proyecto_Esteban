'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/use-auth-store';
import { useLocationStore, isLocationMatching } from '@/store/use-location-store';
import { staffApi } from '@/lib/api-client';
import { MOCK_EMPLOYEES } from '@/lib/mock-data';
import {
  LayoutDashboard,
  Clock,
  CalendarDays,
  Users,
  FileBarChart,
  Settings,
  ChevronLeft,
  ChevronRight,
  Building2,
  Tablet,
  Activity,
  MapPin,
  LogOut,
} from 'lucide-react';

const NAV_ITEMS = [
  { label: 'Live Overview', href: '/admin', icon: LayoutDashboard },
  { label: 'Live Attendance Logs', href: '/admin/punches', icon: Clock, badge: 'LIVE' },
  { label: 'Shift Schedules', href: '/admin/schedules', icon: CalendarDays },
  { label: 'Staff Directory', href: '/admin/employees', icon: Users, isStaffBadge: true },
  { label: 'Reports & Payroll', href: '/admin/reports', icon: FileBarChart },
  { label: 'Branch Locations', href: '/admin/locations', icon: MapPin, superAdminOnly: true },
  { label: 'Settings & Audit', href: '/admin/settings', icon: Settings, superAdminOnly: true },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [staffCount, setStaffCount] = useState<number | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const { selectedLocationId } = useLocationStore();

  const isSuperAdmin = user?.role === 'SUPER_ADMIN' && user?.email === 'admin@nexustaff.com';

  useEffect(() => {
    async function getStaffCount() {
      try {
        const list = await staffApi.list();
        if (Array.isArray(list)) {
          const filtered = list.filter((item: any) => {
            if (item.role === 'SUPER_ADMIN' || item.jobPositionCode === 'SUPER_ADMIN' || item.employeeNumber?.startsWith('ADM-')) {
              return false;
            }
            if (!isSuperAdmin) {
              return isLocationMatching(item.assignments?.[0]?.locationId || item.locationId, item.assignments?.[0]?.location?.locationCode || item.locationCode, selectedLocationId);
            }
            return true;
          });
          setStaffCount(filtered.length);
          return;
        }
      } catch (e) {}
      const mockFiltered = MOCK_EMPLOYEES.filter((emp) => {
        if (emp.jobPositionCode === 'SUPER_ADMIN' || emp.employeeNumber?.startsWith('ADM-')) return false;
        return isLocationMatching(emp.locationId, emp.locationCode, selectedLocationId);
      });
      setStaffCount(mockFiltered.length);
    }
    getStaffCount();
  }, [user, selectedLocationId, isSuperAdmin]);

  const handleLogout = () => {
    logout();
    router.push('/admin/login');
  };

  // Filter NAV_ITEMS according to user role
  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (item.superAdminOnly && !isSuperAdmin) {
      return false;
    }
    return true;
  });

  return (
    <aside
      className={`relative flex flex-col border-r border-slate-800 bg-slate-950 text-slate-100 transition-all duration-300 ${
        collapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Brand Header */}
      <div className="flex h-16 items-center justify-between px-4 border-b border-slate-800 bg-slate-900/80">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-blue-700 to-blue-500 text-white font-black shadow-lg shadow-blue-500/30 border border-blue-400/30">
            <Building2 className="h-5 w-5" />
          </div>
          {!collapsed && (
            <div className="flex flex-col truncate">
              <span className="font-black text-sm tracking-tight text-white flex items-center gap-1.5">
                NexuStaff <span className="text-[9px] text-blue-400 font-mono px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/20">{isSuperAdmin ? 'ENTERPRISE' : 'BRANCH'}</span>
              </span>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Staff Management</span>
            </div>
          )}
        </div>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
          title="Toggle Navigation"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {/* Navigation Subheader */}
      {!collapsed && (
        <div className="px-4 pt-4 pb-1 text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
          <Activity className="h-3 w-3 text-blue-400" /> {isSuperAdmin ? 'Super Admin Modules' : 'Branch Admin Modules'}
        </div>
      )}

      {/* Navigation Links */}
      <nav className="flex-1 space-y-1.5 p-3">
        {visibleNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          const badgeText = item.isStaffBadge ? (staffCount !== null ? String(staffCount) : '4') : item.badge;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center justify-between rounded-xl px-3.5 py-3 text-xs font-extrabold transition-all relative ${
                isActive
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/30 border-l-4 border-blue-400'
                  : 'text-slate-300 hover:bg-slate-900 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                {!collapsed && <span>{item.label}</span>}
              </div>
              {!collapsed && badgeText && (
                <span
                  className={`px-2 py-0.5 text-[9px] font-black rounded-full uppercase ${
                    badgeText === 'LIVE'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-pulse'
                      : 'bg-slate-800 text-slate-300 border border-slate-700'
                  }`}
                >
                  {badgeText}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer Controls: Kiosk Launcher & Logout */}
      <div className="p-3 border-t border-slate-800 space-y-2">
        <Link
          href="/kiosk"
          target="_blank"
          className="flex items-center gap-3 rounded-2xl bg-slate-900/90 p-3 text-xs font-black text-blue-400 hover:bg-slate-800 hover:text-blue-300 border border-slate-800 transition-all shadow-md group"
        >
          <div className="h-7 w-7 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0 border border-blue-500/20 group-hover:bg-blue-500 group-hover:text-white transition-colors">
            <Tablet className="h-3.5 w-3.5" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-white group-hover:text-blue-300">Open Tablet Kiosk</span>
              <span className="text-[9px] text-slate-400 font-medium">Touchscreen Kiosk Mode</span>
            </div>
          )}
        </Link>

        {/* Sign Out Button */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 rounded-2xl bg-slate-950 hover:bg-rose-600/20 text-slate-400 hover:text-rose-300 p-3 text-xs font-extrabold border border-slate-800 hover:border-rose-500/30 transition-all cursor-pointer"
        >
          <LogOut className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-rose-400" />
          {!collapsed && <span>Cerrar Sesión</span>}
        </button>
      </div>
    </aside>
  );
}

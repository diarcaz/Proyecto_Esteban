'use client';
import { displayLabel } from '@/lib/display-labels';
import Link from 'next/link';
import { useAuthStore } from '@/store/use-auth-store';
import { ShieldCheck, MapPin, Tablet, Settings } from 'lucide-react';
export default function SettingsPage() {
  const {user}=useAuthStore();
  return <section className="max-w-5xl space-y-6"><header><p className="eyebrow">Workspace administration</p><h2 className="page-title">Settings</h2><p className="text-sm text-slate-400">Manage branch configuration and terminal setup.</p></header><div className="grid md:grid-cols-2 gap-4">
    <article className="panel p-6 space-y-4"><MapPin className="text-blue-400"/><h3 className="font-semibold text-lg">Branch configuration</h3><p className="text-sm text-slate-400">Update branch names, addresses and timezones in Branch Locations.</p><Link href="/admin/locations" className="inline-block text-blue-300 font-semibold text-sm">Manage branches →</Link></article>
    <article className="panel p-6 space-y-4"><Tablet className="text-blue-400"/><h3 className="font-semibold text-lg">Terminal Setup</h3><p className="text-sm text-slate-400">Choose an authorized branch and confirm this device’s clock context.</p><Link href="/clock/setup" className="inline-block text-blue-300 font-semibold text-sm">Terminal Setup →</Link></article>
    <article className="panel p-6 space-y-4"><ShieldCheck className="text-emerald-400"/><h3 className="font-semibold text-lg">Signed-in account</h3><p className="text-sm">{user?.name}</p><span className="status-badge">{displayLabel(user?.role)}</span><p className="text-sm text-slate-400">Access is determined by your assigned permissions and branches.</p></article>

  </div></section>;
}

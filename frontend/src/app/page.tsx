import Link from 'next/link';
import { Building2, Tablet, ArrowRight, ShieldCheck } from 'lucide-react';

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-white">
      <div className="max-w-3xl w-full text-center space-y-6">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold uppercase tracking-wider">
          <ShieldCheck className="h-4 w-4" /> Enterprise Multi-Location Platform
        </div>
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">
          Staffing Attendance & <span className="text-indigo-500">Payroll System</span>
        </h1>
        <p className="text-slate-400 text-base max-w-xl mx-auto">
          Multi-location RBAC, double-shift time tracking, tablet kiosk PIN clocking, and automated Adams Keegan / payroll punch exports.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-8">
          <Link
            href="/admin"
            className="group flex flex-col items-start p-6 rounded-2xl bg-slate-900 border border-slate-800 hover:border-indigo-500 transition-all text-left shadow-lg"
          >
            <div className="h-12 w-12 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Building2 className="h-6 w-6" />
            </div>
            <h3 className="text-xl font-bold text-white flex items-center justify-between w-full">
              Admin Portal <ArrowRight className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </h3>
            <p className="text-xs text-slate-400 mt-2">
              Multi-location management, Live Time Punches sheet, staff schedules, and payroll exports.
            </p>
          </Link>

          <Link
            href="/kiosk"
            className="group flex flex-col items-start p-6 rounded-2xl bg-slate-900 border border-slate-800 hover:border-emerald-500 transition-all text-left shadow-lg"
          >
            <div className="h-12 w-12 rounded-xl bg-emerald-600/20 text-emerald-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Tablet className="h-6 w-6" />
            </div>
            <h3 className="text-xl font-bold text-white flex items-center justify-between w-full">
              Tablet Kiosk Mode <ArrowRight className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </h3>
            <p className="text-xs text-slate-400 mt-2">
              High-speed wall-mounted tablet punch clock with 4-digit employee PIN identification.
            </p>
          </Link>
        </div>
      </div>
    </main>
  );
}

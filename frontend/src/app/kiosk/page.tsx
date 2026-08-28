'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { DigitalClock } from '@/components/kiosk/digital-clock';
import { PinPad } from '@/components/kiosk/pin-pad';
import { Building2, ShieldCheck, MapPin, Settings } from 'lucide-react';

export default function KioskPage() {
  const [deviceLocationName, setDeviceLocationName] = useState('Sucursal Centro - MÉRIDA');
  const [deviceLocationCode, setDeviceLocationCode] = useState('MID-1001');

  useEffect(() => {
    // Read paired location from localStorage
    const stored = localStorage.getItem('kiosk_device_location');
    if (stored) {
      try {
        const loc = JSON.parse(stored);
        if (loc.name) setDeviceLocationName(loc.name);
        if (loc.code) setDeviceLocationCode(loc.code);
      } catch (e) {}
    }
  }, []);

  return (
    <main className="min-h-screen w-full bg-slate-950 flex flex-col justify-between p-6 sm:p-10 font-sans relative overflow-hidden text-slate-100 select-none">
      {/* Background Ambient Blobs */}
      <div className="absolute top-1/4 left-1/4 h-[450px] w-[450px] rounded-full bg-blue-600/20 blur-[140px] pointer-events-none animate-blob" />
      <div className="absolute bottom-1/4 right-1/4 h-[450px] w-[450px] rounded-full bg-indigo-600/20 blur-[140px] pointer-events-none animate-blob animation-delay-2000" />
      <div className="absolute top-2/3 left-1/2 -translate-x-1/2 h-[350px] w-[350px] rounded-full bg-purple-600/15 blur-[120px] pointer-events-none animate-blob animation-delay-4000" />

      {/* Header Bar */}
      <header className="flex items-center justify-between w-full max-w-6xl mx-auto relative z-20">
        <div className="flex items-center gap-3.5">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-blue-600 via-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-xl border border-white/20 connecteam-glow-blue">
            <Building2 className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
              NexuStaff <span className="text-xs font-extrabold px-2.5 py-0.5 rounded-md bg-blue-500/20 text-blue-300 border border-blue-500/30">TOUCH KIOSK</span>
            </h1>
            <p className="text-xs text-slate-400 font-semibold tracking-wide">
              Enterprise Staffing Management &amp; Attendance System
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Paired Branch Location Badge */}
          <div className="hidden sm:flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-slate-900/90 border border-slate-800 text-xs shadow-md">
            <MapPin className="h-4 w-4 text-emerald-400" />
            <div className="flex flex-col text-left">
              <span className="text-white font-extrabold">{deviceLocationName}</span>
              <span className="text-[9px] text-emerald-400 font-mono font-bold">BRANCH [{deviceLocationCode}]</span>
            </div>
          </div>

          {/* Kiosk Device Pairing Setup Link */}
          <Link
            href="/kiosk/setup"
            className="p-2.5 rounded-2xl bg-slate-900/90 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition-colors shadow-md cursor-pointer"
            title="Configure Kiosk Device Branch Pairing"
          >
            <Settings className="h-5 w-5" />
          </Link>
        </div>
      </header>

      {/* Main Center Stage Grid */}
      <div className="w-full max-w-6xl mx-auto my-auto py-8 grid grid-cols-1 lg:grid-cols-2 gap-10 items-center justify-center relative z-20">
        <DigitalClock />
        <PinPad />
      </div>

      {/* Footer Bar */}
      <footer className="w-full max-w-6xl mx-auto flex items-center justify-between text-xs text-slate-400 font-bold border-t border-slate-800/80 pt-4 relative z-20">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Kiosk Device Synced &amp; Operational</span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400">
          <ShieldCheck className="h-4 w-4 text-blue-400" />
          <span>NexuStaff Security Engine v2.4</span>
        </div>
      </footer>
    </main>
  );
}

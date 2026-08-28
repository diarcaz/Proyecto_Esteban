'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { MOCK_LOCATIONS, LocationMock } from '@/lib/mock-data';
import { locationsApi } from '@/lib/api-client';
import { Tablet, MapPin, ShieldCheck, CheckCircle2, ArrowRight } from 'lucide-react';

export default function KioskSetupPage() {
  const router = useRouter();
  const [locations, setLocations] = useState<LocationMock[]>(MOCK_LOCATIONS);
  const [selectedLocation, setSelectedLocation] = useState<LocationMock>(MOCK_LOCATIONS[0]);
  const [pairingKey, setPairingKey] = useState('1001');
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    async function loadLocations() {
      try {
        const data = await locationsApi.list();
        if (Array.isArray(data) && data.length > 0) {
          const mapped: LocationMock[] = data.map((loc: any) => ({
            id: loc.id,
            name: loc.name,
            code: loc.locationCode || loc.code || 'LOC-100',
            address: loc.address || '',
            city: loc.city || loc.address || '',
            activeStaffCount: loc._count?.assignments || loc.assignments?.length || 0,
            kioskCode: loc.locationCode?.split('-')[1] || '1001',
          }));
          setLocations(mapped);

          // Read current paired location if exists
          const stored = localStorage.getItem('kiosk_device_location');
          if (stored) {
            try {
              const loc = JSON.parse(stored);
              const match = mapped.find((l) => l.id === loc.id || l.code === loc.code);
              if (match) {
                setSelectedLocation(match);
                setPairingKey(match.kioskCode);
                return;
              }
            } catch (e) {}
          }
          setSelectedLocation(mapped[0]);
          setPairingKey(mapped[0].kioskCode);
        }
      } catch (e) {
        console.warn('Could not fetch locations from backend API:', e);
      }
    }
    loadLocations();
  }, []);

  const handleSavePairing = (e: React.FormEvent) => {
    e.preventDefault();

    // Store paired device location metadata in localStorage
    const deviceLocationObj = {
      id: selectedLocation.id,
      code: selectedLocation.code,
      name: selectedLocation.name,
      city: selectedLocation.city,
      kioskCode: pairingKey || selectedLocation.kioskCode,
      pairedAt: new Date().toISOString(),
    };

    localStorage.setItem('kiosk_device_location', JSON.stringify(deviceLocationObj));
    setSavedSuccess(true);

    setTimeout(() => {
      router.push('/kiosk');
    }, 1500);
  };

  return (
    <div className="min-h-screen w-full bg-slate-950 flex flex-col items-center justify-center p-6 font-sans relative overflow-hidden text-white">
      {/* Background Ambient Blobs */}
      <div className="absolute top-1/3 left-1/3 h-96 w-96 rounded-full bg-blue-600/20 blur-[130px] pointer-events-none animate-blob" />

      <div className="w-full max-w-lg connecteam-glass-card rounded-3xl p-8 shadow-2xl border border-slate-800 space-y-6 relative z-10">
        {/* Header */}
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="h-16 w-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-black flex items-center justify-center shadow-xl border border-white/20 connecteam-glow-blue mb-1">
            <Tablet className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-black tracking-tight">Tablet Device Branch Pairing</h1>
          <p className="text-xs text-slate-400 font-medium">
            Configure device location binding for this touchscreen wall tablet kiosk.
          </p>
        </div>

        {savedSuccess && (
          <div className="p-4 rounded-2xl bg-emerald-600/90 text-white flex items-center gap-3 text-xs font-bold border border-emerald-400 shadow-xl animate-bounce">
            <CheckCircle2 className="h-5 w-5" /> Tablet Paired Successfully! Redirecting to Touchscreen Kiosk...
          </div>
        )}

        <form onSubmit={handleSavePairing} className="space-y-5 text-xs">
          {/* Branch Location Select */}
          <div className="space-y-1.5">
            <label className="block text-slate-300 font-extrabold uppercase tracking-wider text-[10px]">
              Select Branch Location for Device
            </label>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {locations.map((loc) => {
                const isSelected = selectedLocation.id === loc.id;
                return (
                  <div
                    key={loc.id}
                    onClick={() => {
                      setSelectedLocation(loc);
                      setPairingKey(loc.kioskCode);
                    }}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? 'bg-blue-600/20 border-blue-500 shadow-lg connecteam-glow-blue'
                        : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <MapPin className={`h-5 w-5 ${isSelected ? 'text-blue-400' : 'text-slate-500'}`} />
                      <div>
                        <p className="font-extrabold text-white">{loc.name}</p>
                        <p className="text-[11px] text-slate-400">{loc.city} &bull; Code: [{loc.code}]</p>
                      </div>
                    </div>
                    <span className="font-mono font-bold text-xs text-emerald-400 bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800">
                      Kiosk #{loc.kioskCode}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Pairing Access Key */}
          <div className="space-y-1.5">
            <label className="block text-slate-300 font-extrabold uppercase tracking-wider text-[10px]">
              Kiosk Pairing Access Code
            </label>
            <input
              type="text"
              required
              value={pairingKey}
              onChange={(e) => setPairingKey(e.target.value)}
              placeholder="e.g. 1001"
              className="w-full p-3 rounded-2xl bg-slate-950 border border-slate-800 text-white font-mono text-center font-bold text-sm"
            />
          </div>

          {/* Save Pairing Button */}
          <button
            type="submit"
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-black text-xs uppercase tracking-wider shadow-xl connecteam-glow-emerald transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2 border border-emerald-400/40"
          >
            <span>Save Device Pairing &amp; Launch Kiosk</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>

        <div className="flex items-center justify-between text-[10px] text-slate-500 font-semibold border-t border-slate-800 pt-3">
          <span className="flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5 text-blue-400" /> Device ID: TBLT-{Date.now().toString().slice(-4)}</span>
          <span>NexuStaff Device Engine v2.4</span>
        </div>
      </div>
    </div>
  );
}

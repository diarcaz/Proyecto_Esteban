'use client';

import { useEffect, useState } from 'react';
import { FALLBACK_TIMEZONES, timezoneOptions, timezoneLabel } from '@/lib/property-form';

export function TimezoneSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [zones, setZones] = useState(FALLBACK_TIMEZONES);
  useEffect(() => { setZones(timezoneOptions(value)); }, [value]);
  return <div>
    <label htmlFor="property-timezone" className="block text-slate-400 font-bold mb-1">Time Zone</label>
    <select id="property-timezone" required value={zones.includes(value) ? value : ''} onChange={e => onChange(e.target.value)} className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white">
      <option value="" disabled>Select a time zone</option>
      {zones.map(zone => <option key={zone} value={zone}>{timezoneLabel(zone)}</option>)}
    </select>
    <p className="mt-1 text-slate-400">Offsets shown for today; daylight saving time may change them.</p>
  </div>;
}

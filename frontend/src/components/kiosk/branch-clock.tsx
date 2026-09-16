'use client';
export function BranchClock({ now, timezone }: { now: Date; timezone?: string }) {
  if (!timezone) return <p className="text-slate-400">Configure this terminal to show branch time.</p>;
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const value = (type: string) => Number(parts.find(p => p.type === type)?.value || 0);
  const hours = value('hour'), minutes = value('minute'), seconds = value('second');
  return <div className="space-y-6">
    <svg viewBox="0 0 240 240" role="img" aria-label="Branch local analog clock" className="w-56 sm:w-72 mx-auto drop-shadow-2xl">
      <circle cx="120" cy="120" r="116" fill="#0f172a" stroke="#334155" strokeWidth="2"/>
      {Array.from({ length: 12 }, (_, i) => <line key={i} x1="120" y1="14" x2="120" y2={i % 3 ? 21 : 29} stroke={i % 3 ? '#64748b' : '#93c5fd'} strokeWidth="3" transform={`rotate(${i * 30} 120 120)`}/>)}
      <line x1="120" y1="120" x2="120" y2="66" stroke="#f1f5f9" strokeWidth="6" strokeLinecap="round" transform={`rotate(${hours * 30 + minutes / 2} 120 120)`}/>
      <line x1="120" y1="120" x2="120" y2="42" stroke="#93c5fd" strokeWidth="4" strokeLinecap="round" transform={`rotate(${minutes * 6 + seconds / 10} 120 120)`}/>
      <line x1="120" y1="134" x2="120" y2="35" stroke="#3b82f6" strokeWidth="2" transform={`rotate(${seconds * 6} 120 120)`}/>
      <circle cx="120" cy="120" r="5" fill="#3b82f6"/>
    </svg>
    <p className="text-4xl sm:text-5xl font-light tabular-nums tracking-tight">{now.toLocaleTimeString('en-US', { timeZone: timezone, hour: '2-digit', minute: '2-digit' })}</p>
    <p className="text-slate-400">{now.toLocaleDateString('en-US', { timeZone: timezone, weekday: 'long', month: 'long', day: 'numeric' })}</p>
  </div>;
}

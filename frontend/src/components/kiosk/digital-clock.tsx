'use client';

import React, { useState, useEffect } from 'react';
import { formatDate } from '@/lib/utils';
import { Clock, Radio, ShieldCheck } from 'lucide-react';

export function DigitalClock() {
  const [time, setTime] = useState<Date | null>(null);

  useEffect(() => {
    setTime(new Date());
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!time) return <div className="h-64" />;

  const hours = time.getHours();
  const minutes = time.getMinutes();
  const seconds = time.getSeconds();

  // Analog Hand Angles Calculation
  const hourAngle = ((hours % 12) + minutes / 60) * 30; // 360 / 12 = 30 deg per hour
  const minuteAngle = (minutes + seconds / 60) * 6;     // 360 / 60 = 6 deg per min
  const secondAngle = seconds * 6;                        // 360 / 60 = 6 deg per sec

  const formattedTime = time.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  return (
    <div className="flex flex-col items-center justify-center text-center relative z-10 font-sans space-y-4">
      {/* Live Clock Engine Status Badge */}
      <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-extrabold uppercase tracking-widest backdrop-blur-md shadow-lg">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500"></span>
        </span>
        <span>NexuStaff Analog &amp; Digital Clock</span>
      </div>

      {/* GIANT CIRCULAR ANALOG CLOCK FACE (220px x 220px) */}
      <div className="relative h-56 w-56 rounded-full border-4 border-blue-500/40 bg-slate-900/90 shadow-2xl connecteam-glow-blue backdrop-blur-2xl flex items-center justify-center border-t-blue-400 border-r-indigo-500 border-b-purple-500">
        
        {/* 12 Hour Radial Tick Marks */}
        {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg, idx) => {
          const isQuarter = idx % 3 === 0;
          return (
            <div
              key={deg}
              className="absolute w-full h-full flex justify-center pt-2.5 pointer-events-none"
              style={{ transform: `rotate(${deg}deg)` }}
            >
              <div
                className={`rounded-full ${
                  isQuarter
                    ? 'h-3.5 w-1 bg-blue-400 shadow-md shadow-blue-400/50'
                    : 'h-2 w-0.5 bg-slate-600'
                }`}
              />
            </div>
          );
        })}

        {/* HOUR HAND */}
        <div
          className="absolute bottom-1/2 left-1/2 w-1.5 h-16 bg-gradient-to-t from-white to-blue-300 rounded-full clock-hand shadow-lg border border-blue-400/50 z-10"
          style={{
            transform: `translateX(-50%) rotate(${hourAngle}deg)`,
          }}
        />

        {/* MINUTE HAND */}
        <div
          className="absolute bottom-1/2 left-1/2 w-1 h-22 bg-gradient-to-t from-blue-400 to-indigo-300 rounded-full clock-hand shadow-lg z-20"
          style={{
            transform: `translateX(-50%) rotate(${minuteAngle}deg)`,
          }}
        />

        {/* SECOND HAND */}
        <div
          className="absolute bottom-1/2 left-1/2 w-0.5 h-24 bg-rose-500 rounded-full clock-hand-second z-30 shadow-md"
          style={{
            transform: `translateX(-50%) rotate(${secondAngle}deg)`,
          }}
        >
          {/* Glowing Red Tip Dot */}
          <div className="absolute -top-1 -left-1 h-2.5 w-2.5 rounded-full bg-rose-400 shadow-md shadow-rose-500/80" />
        </div>

        {/* CENTER PIN CAP */}
        <div className="absolute h-5 w-5 rounded-full bg-slate-900 border-2 border-blue-400 z-40 shadow-xl flex items-center justify-center">
          <div className="h-1.5 w-1.5 rounded-full bg-rose-500" />
        </div>
      </div>

      {/* GIANT DIGITAL TIME DISPLAY UNDERNEATH */}
      <div className="flex flex-col items-center">
        <div className="text-4xl sm:text-5xl font-black tracking-tight text-white font-mono drop-shadow-2xl select-none">
          {formattedTime}
        </div>
        <div className="text-xs font-bold text-slate-300 mt-1.5 flex items-center gap-2 bg-slate-900/80 px-4 py-1.5 rounded-xl border border-slate-800 backdrop-blur-md">
          <Clock className="h-4 w-4 text-blue-400" />
          <span>{formatDate(time)}</span>
        </div>
      </div>
    </div>
  );
}

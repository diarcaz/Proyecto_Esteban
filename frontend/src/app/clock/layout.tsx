import React from 'react';

export const metadata = {
  title: 'NexuStaff Touch Clock | Staff Kiosk Portal',
  description: 'Touchscreen staff time tracking kiosk with PIN authentication',
};

export default function ClockLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen w-full bg-slate-100 text-slate-900 font-sans antialiased select-none flex flex-col">
      {children}
    </div>
  );
}

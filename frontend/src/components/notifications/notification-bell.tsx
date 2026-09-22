'use client';

import React, { useState, useEffect } from 'react';
import { Bell, AlertCircle, Clock, ShieldAlert, CheckCircle2, X } from 'lucide-react';
import { useAuthStore } from '@/store/use-auth-store';
import { useLocationStore } from '@/store/use-location-store';
import { can } from '@/lib/admin-access';
import { API_BASE } from '@/lib/api-client';
import { audioEngine } from '@/lib/audio-feedback';

export interface AlertItem {
  id: string;
  type: 'LATE' | 'OVERTIME' | 'ANTI_TAMPER' | 'OFFLINE_SYNC';
  title: string;
  message: string;
  time: string;
  read: boolean;
}

export function NotificationBell() {
  const { user, token } = useAuthStore();
  const { selectedLocationId } = useLocationStore();
  const permitted = can(user, 'TIME_VIEW', selectedLocationId);
  const [isOpen, setIsOpen] = useState(false);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);

  const unreadCount = alerts.filter((a) => !a.read).length;

  useEffect(() => {
    setAlerts([]);
    if (!token || !permitted) return;
    try {
      const { io } = require('socket.io-client');
      const socket = io(new URL(API_BASE).origin + '/events', { autoConnect: false, auth: { token } });

      socket.on('connect', () => socket.emit('subscribeSupervisorAlerts', selectedLocationId === 'ALL' ? {} : { propertyId: selectedLocationId }));
      socket.connect();

      socket.on('attendanceAlert', (data: any) => {
        audioEngine.playErrorBeep();
        setAlerts((prev) => [
          {
            id: `alert-${Date.now()}`,
            type: data.type === 'LATE_ATTENDANCE' ? 'LATE' : data.type === 'OVERTIME_ALERT' ? 'OVERTIME' : 'ANTI_TAMPER',
            title: data.title || 'Attendance alert',
            message: data.message,
            time: 'Just now',
            read: false,
          },
          ...prev,
        ]);
      });

      return () => {
        socket.disconnect();
      };
    } catch (e) {}
  }, [token, permitted, selectedLocationId]);

  const markAllAsRead = () => {
    setAlerts(alerts.map((a) => ({ ...a, read: true })));
  };

  const removeAlert = (id: string) => {
    setAlerts(alerts.filter((a) => a.id !== id));
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2.5 rounded-2xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition-all cursor-pointer shadow-md"
        title="Attendance alerts"
        aria-label="Attendance alerts"
        aria-expanded={isOpen}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-rose-500 text-white font-mono text-[10px] font-black flex items-center justify-center border-2 border-slate-900 animate-pulse">
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="fixed left-3 right-3 top-32 sm:absolute sm:left-auto sm:right-0 sm:top-auto mt-3 sm:w-96 rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl z-50 overflow-hidden font-sans text-xs animate-fade-in">
          <div className="flex items-center justify-between p-4 bg-slate-950 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-blue-400" />
              <span className="font-black text-white">Attendance alerts</span>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 text-[10px] font-bold border border-rose-500/30">
                  {unreadCount} new
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button onClick={markAllAsRead} className="text-[10px] text-blue-400 hover:underline font-bold">
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-slate-800/60 p-2">
            {alerts.length === 0 ? (
              <div className="p-6 text-center text-slate-500 font-medium">No active alerts recorded.</div>
            ) : (
              alerts.map((item) => (
                <div
                  key={item.id}
                  className={`p-3 rounded-2xl transition-colors relative group ${
                    item.read ? 'bg-slate-900/40 opacity-70' : 'bg-slate-800/60 border border-slate-700/60'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    {item.type === 'LATE' && <Clock className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />}
                    {item.type === 'OVERTIME' && <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />}
                    {item.type === 'ANTI_TAMPER' && <ShieldAlert className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />}

                    <div className="flex-1 space-y-0.5">
                      <div className="flex items-center justify-between">
                        <p className="font-bold text-white text-xs">{item.title}</p>
                        <span className="text-[9px] text-slate-400 font-mono">{item.time}</span>
                      </div>
                      <p className="text-[11px] text-slate-300 font-medium leading-snug">{item.message}</p>
                    </div>

                    <button
                      onClick={() => removeAlert(item.id)}
                      aria-label="Dismiss alert"
                      className="text-slate-500 hover:text-rose-400 p-0.5 transition-opacity"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

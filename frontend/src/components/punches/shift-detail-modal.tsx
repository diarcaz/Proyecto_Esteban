'use client';

import React, { useState } from 'react';
import { PunchMock } from '@/lib/mock-data';
import { usePunchStore } from '@/store/use-punch-store';
import { X, MapPin, Tablet, Clock, ShieldCheck, FileCheck, Edit3, CheckCircle2 } from 'lucide-react';

interface ShiftDetailModalProps {
  punch: PunchMock | null;
  onClose: () => void;
}

export function ShiftDetailModal({ punch, onClose }: ShiftDetailModalProps) {
  const { updatePunchTime, approveOvertime } = usePunchStore();

  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const [adjustedIn, setAdjustedIn] = useState(punch?.actualIn || '08:00 AM');
  const [adjustedOut, setAdjustedOut] = useState(punch?.actualOut || '04:30 PM');

  if (!punch) return null;

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const handleSaveAdjust = (e: React.FormEvent) => {
    e.preventDefault();
    updatePunchTime(punch.id, adjustedIn, adjustedOut);
    setShowAdjustModal(false);
    showToast(`Punch timestamps updated for ${punch.employeeName}. Changes saved.`);
  };

  const handleApproveOvertime = () => {
    approveOvertime(punch.id);
    showToast(`Overtime hours approved for ${punch.employeeName}. Recorded in Audit Log.`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in font-sans">
      <div className="w-full max-w-xl connecteam-glass-card rounded-3xl p-6 shadow-2xl border border-slate-700/80 space-y-6 relative text-white">
        {/* Toast Notification */}
        {toastMsg && (
          <div className="p-3.5 rounded-2xl bg-emerald-600/95 text-white flex items-center gap-2.5 text-xs font-bold border border-emerald-400 shadow-xl animate-bounce">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            <span>{toastMsg}</span>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 text-white font-black text-xl flex items-center justify-center shadow-lg border border-white/20">
              {punch.employeeName.charAt(0)}
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight text-white">{punch.employeeName}</h2>
              <p className="text-xs text-slate-400 font-mono">
                Emp #: <span className="text-white font-bold">{punch.employeeNumber}</span> &bull; Pos:{' '}
                <span className="text-blue-400 font-bold">{punch.jobPositionCode}</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Visual Shift Timeline */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-blue-400" /> Shift Timeline Breakdown
            </span>

            {punch.isOvertimeApproved && (
              <span className="text-[10px] font-black text-emerald-400 bg-emerald-500/20 px-2.5 py-0.5 rounded-full border border-emerald-500/30 flex items-center gap-1">
                <ShieldCheck className="h-3 w-3" /> OVERTIME APPROVED
              </span>
            )}
          </div>

          <div className="grid grid-cols-4 gap-2 text-center p-3 rounded-2xl bg-slate-950/80 border border-slate-800 text-xs">
            <div className="space-y-1">
              <span className="text-[9px] text-slate-500 font-bold uppercase">Clock In</span>
              <p className="font-mono font-bold text-emerald-400">{punch.actualIn || '08:00 AM'}</p>
            </div>
            <div className="space-y-1 border-l border-slate-800">
              <span className="text-[9px] text-slate-500 font-bold uppercase">Inicio Receso</span>
              <p className="font-mono font-bold text-amber-400">{punch.lunchStart || '--:--'}</p>
            </div>
            <div className="space-y-1 border-l border-slate-800">
              <span className="text-[9px] text-slate-500 font-bold uppercase">Fin Receso</span>
              <p className="font-mono font-bold text-blue-400">{punch.lunchEnd || '--:--'}</p>
            </div>
            <div className="space-y-1 border-l border-slate-800">
              <span className="text-[9px] text-slate-500 font-bold uppercase">Clock Out</span>
              <p className="font-mono font-bold text-rose-400">{punch.actualOut || 'ON SHIFT'}</p>
            </div>
          </div>
        </div>

        {/* Verification Info */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-1">
            <span className="text-[10px] text-slate-500 font-bold uppercase flex items-center gap-1">
              <Tablet className="h-3.5 w-3.5 text-blue-400" /> Method
            </span>
            <p className="font-bold text-white">Touch Kiosk (PIN Code)</p>
          </div>

          <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-1">
            <span className="text-[10px] text-slate-500 font-bold uppercase flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5 text-emerald-400" /> Location
            </span>
            <p className="font-bold text-white">{punch.locationCode}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between border-t border-slate-800 pt-4">
          <button
            onClick={() => setShowAdjustModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 transition-colors cursor-pointer"
          >
            <Edit3 className="h-4 w-4" /> Adjust Punch Time
          </button>

          {(punch.isOvertime || punch.status === 'OVERTIME') && !punch.isOvertimeApproved && (
            <button
              onClick={handleApproveOvertime}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-black text-white shadow-lg transition-all active:scale-95 cursor-pointer"
            >
              <FileCheck className="h-4 w-4" /> Approve Overtime
            </button>
          )}
        </div>

        {/* Adjust Time Modal Overlay */}
        {showAdjustModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-fade-in font-sans">
            <form onSubmit={handleSaveAdjust} className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4 text-white">
              <h3 className="text-base font-black text-white">Adjust Clock Times</h3>
              <p className="text-xs text-slate-400">Modify timestamps for auditor records.</p>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">Clock In Time</label>
                  <input
                    type="text"
                    value={adjustedIn}
                    onChange={(e) => setAdjustedIn(e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 font-mono text-sm font-bold text-emerald-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">Clock Out Time</label>
                  <input
                    type="text"
                    value={adjustedOut}
                    onChange={(e) => setAdjustedOut(e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 font-mono text-sm font-bold text-rose-400"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAdjustModal(false)}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 text-xs font-bold text-slate-300 hover:bg-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-black text-white shadow-lg cursor-pointer"
                >
                  Save Adjustment
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { attendanceApi } from '@/lib/api-client';
import { BranchClock } from '@/components/kiosk/branch-clock';
import { formatPropertyTimestamp, InteractionGeneration, readTerminalConfig, TerminalConfig } from '@/lib/clock-context';

type Step = 'IDLE' | 'VERIFYING' | 'ACTIONS' | 'RECORDING' | 'SUCCESS' | 'ERROR';
const labels: Record<string, string> = { CLOCK_IN: 'Clock In', LUNCH_START: 'Start Meal Break', LUNCH_END: 'End Meal Break', LUNCH2_START: 'Start Second Break', LUNCH2_END: 'End Second Break', CLOCK_OUT: 'Clock Out' };

export default function ClockPage() {
  const [terminal, setTerminal] = useState<TerminalConfig | null>(null);
  const [step, setStep] = useState<Step>('IDLE');
  const [pin, setPin] = useState('');
  const [status, setStatus] = useState<any>(null);
  const [confirmation, setConfirmation] = useState<any>(null);
  const [error, setError] = useState('');
  const [now, setNow] = useState(new Date());
  const interaction = useRef(new InteractionGeneration());
  const inactivity = useRef<ReturnType<typeof setTimeout>>();
  const autoReset = useRef<ReturnType<typeof setTimeout>>();
  const busy = useRef(false);

  const reset = useCallback(() => {
    interaction.current.next(); busy.current = false;
    clearTimeout(inactivity.current); clearTimeout(autoReset.current);
    setPin(''); setStatus(null); setConfirmation(null); setError(''); setStep('IDLE');
  }, []);
  const touch = useCallback(() => {
    clearTimeout(inactivity.current);
    inactivity.current = setTimeout(reset, 30000);
  }, [reset]);
  useEffect(() => {
    try { setTerminal(readTerminalConfig(localStorage.getItem('kiosk_terminal_config'))); } catch { setTerminal(null); }
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => {
      interaction.current.next(); busy.current = false;
      clearInterval(timer); clearTimeout(inactivity.current); clearTimeout(autoReset.current);
    };
  }, []);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!terminal || !/^\d{6}$/.test(pin) || busy.current) return;
    busy.current = true; touch();
    const generation = interaction.current.next();
    setStep('VERIFYING');
    try {
      const data = await attendanceApi.kioskIdentify({ pin_code: pin, property_id: terminal.propertyId });
      if (!interaction.current.isCurrent(generation)) return;
      setStatus(data); setStep('ACTIONS'); touch();
    } catch (e: any) {
      if (!interaction.current.isCurrent(generation)) return;
      setPin(''); setError(e.message || 'Unable to verify credentials.'); setStep('ERROR');
      autoReset.current = setTimeout(reset, 5000);
    } finally { if (interaction.current.isCurrent(generation)) busy.current = false; }
  }
  async function punch(type: string) {
    if (!terminal || !status || busy.current || !status.shiftState.allowedActions.includes(type)) return;
    busy.current = true; touch();
    const generation = interaction.current.next();
    setStep('RECORDING');
    try {
      const result = await attendanceApi.kioskClock({ employee_number: status.employee.employeeNumber, pin_code: pin, property_id: terminal.propertyId, type });
      if (!interaction.current.isCurrent(generation)) return;
      setPin(''); setConfirmation(result); setStep('SUCCESS');
      clearTimeout(inactivity.current); autoReset.current = setTimeout(reset, 5000);
    } catch (e: any) {
      if (!interaction.current.isCurrent(generation)) return;
      setPin(''); setError(e.message || 'Unable to record punch.'); setStep('ERROR');
      autoReset.current = setTimeout(reset, 5000);
    } finally { if (interaction.current.isCurrent(generation)) busy.current = false; }
  }
  const timezone = confirmation?.location?.timezone || status?.location?.timezone || terminal?.timezone;
  function format(timestamp: string | Date) {
    if (!timezone) return 'Time unavailable';
    try { return formatPropertyTimestamp(timestamp, timezone); } catch { return 'Time unavailable'; }
  }
  return <main className="min-h-screen bg-slate-950 p-4 sm:p-8 text-slate-100">
    <header className="max-w-6xl mx-auto flex flex-wrap gap-4 justify-between items-center border-b border-slate-800 pb-5">
      <div><p className="text-blue-400 text-xs font-bold tracking-widest uppercase">NexuStaff · Time & Attendance</p><h1 className="text-xl font-bold mt-1">{status?.location?.name || terminal?.propertyName || 'Terminal not configured'}</h1><p className="text-xs text-slate-400 mt-1">{terminal?.locationCode} {terminal?.timezone && `· ${terminal.timezone}`}</p></div>
      <Link href="/clock/setup" className="rounded-xl border border-slate-700 px-4 py-3 text-sm">Terminal setup</Link>
    </header>
    <div className="max-w-6xl mx-auto mt-8 grid lg:grid-cols-2 gap-8 items-center">
    <section className="text-center py-8"><BranchClock now={now} timezone={terminal?.timezone}/><h2 className="text-2xl font-bold mt-8">Your shift starts here.</h2><p className="text-slate-400 mt-2">Enter your PIN, confirm your name, and record your punch.</p></section>
    <div className="space-y-6 rounded-3xl border border-slate-700 bg-slate-900 p-6 sm:p-8 shadow-xl">
      {!terminal ? <p>An authorized administrator must <Link href="/clock/setup" className="text-blue-300 underline">configure this terminal</Link> before clocking.</p> : <>
        <p className="text-blue-400 uppercase tracking-widest text-xs font-bold">Staff touch clock</p>
        {step === 'IDLE' && <form onSubmit={verify} className="space-y-5">
          <label className="block font-bold">6-digit PIN
            <input aria-label="6-digit PIN" name="clock-staff-pin" readOnly onFocus={e => { e.currentTarget.readOnly = false; }} data-lpignore="true" type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={pin}
              onChange={e => { setPin(e.target.value.replace(/\D/g, '').slice(0, 6)); touch(); }}
              className="w-full border border-slate-600 bg-slate-950 rounded-xl p-4 mt-2 text-3xl text-center tracking-[0.5em]" />
          </label>
          <div className="grid grid-cols-3 gap-3">{['1','2','3','4','5','6','7','8','9','Clear','0','Delete'].map(key =>
            <button key={key} type="button" className="h-16 bg-slate-800 border border-slate-700 hover:bg-slate-700 active:bg-blue-700 rounded-xl text-xl font-bold" onClick={() => {
              touch(); setPin(value => key === 'Clear' ? '' : key === 'Delete' ? value.slice(0, -1) : (value + key).slice(0, 6));
            }}>{key}</button>)}</div>
          <button disabled={!/^\d{6}$/.test(pin)} className="w-full bg-blue-600 hover:bg-blue-500 text-white rounded-xl p-4 font-bold disabled:opacity-40">Continue to Punch</button>
        </form>}
        {(step === 'VERIFYING' || step === 'RECORDING') && <p role="status">{step === 'VERIFYING' ? 'Verifying credentials…' : 'Recording punch…'}</p>}
        {step === 'ACTIONS' && status && <section className="space-y-5">
          <h2 className="text-2xl font-bold">{status.employee.displayName}</h2>
          <p className="text-blue-300">{status.shiftState.currentStatus.replaceAll('_', ' ')}</p><p className="text-slate-400">{status.employee.department?.name} {status.employee.position?.title && `· ${status.employee.position.title}`}</p>
          {status.shiftState.activeShift && <p>Started: {format(status.shiftState.activeShift.clockInTimestamp)}</p>}
          {status.shiftState.activeShift?.isOverdue && <p>Your previous shift needs administrator review. You may start a new shift here.</p>}
          <div className="grid grid-cols-2 gap-3">{status.shiftState.allowedActions.filter((action: string) => labels[action]).map((action: string) =>
            <button key={action} onClick={() => punch(action)} className="rounded-xl bg-blue-700 text-white p-5 font-bold">{labels[action]}</button>)}</div>
        </section>}
        {step === 'SUCCESS' && confirmation && <section role="status" className="text-center space-y-4">
          <h2 className="text-2xl font-bold text-emerald-400">Punch confirmed</h2>
          <p>{confirmation.employee.displayName}: {labels[confirmation.punchType]}</p>
          <p>{format(confirmation.timestamp)}</p><p>Returning to the clock in 5 seconds.</p>
        </section>}
        {step === 'ERROR' && <p role="alert" className="text-rose-300">{error}</p>}
        {step !== 'IDLE' && <button onClick={reset} className="w-full p-4 rounded-xl border border-slate-600 bg-slate-800">{step === 'SUCCESS' ? 'Done' : 'Not you? Clear PIN'}</button>}
      </>}
    </div></div>
  </main>;
}

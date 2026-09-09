'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { attendanceApi } from '@/lib/api-client';
import { formatPropertyTimestamp, InteractionGeneration, readTerminalConfig, TerminalConfig } from '@/lib/clock-context';

type Step = 'IDLE' | 'VERIFYING' | 'ACTIONS' | 'RECORDING' | 'SUCCESS' | 'ERROR';
const labels: Record<string, string> = { CLOCK_IN: 'Clock In', LUNCH_START: 'Start Meal Break', LUNCH_END: 'End Meal Break', LUNCH2_START: 'Start Second Break', LUNCH2_END: 'End Second Break', CLOCK_OUT: 'Clock Out' };

export default function ClockPage() {
  const [terminal, setTerminal] = useState<TerminalConfig | null>(null);
  const [step, setStep] = useState<Step>('IDLE');
  const [employeeNumber, setEmployeeNumber] = useState('');
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
    setPin(''); setEmployeeNumber(''); setStatus(null); setConfirmation(null); setError(''); setStep('IDLE');
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
    if (!terminal || !employeeNumber.trim() || !/^\d{6}$/.test(pin) || busy.current) return;
    busy.current = true; touch();
    const generation = interaction.current.next();
    setStep('VERIFYING');
    try {
      const data = await attendanceApi.kioskStatus({ employee_number: employeeNumber.trim(), pin_code: pin, property_id: terminal.propertyId });
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
  return <main className="min-h-screen bg-slate-50 p-6 sm:p-10 text-slate-900">
    <header className="max-w-5xl mx-auto flex justify-between items-center bg-white rounded-3xl p-5 shadow-sm">
      <div><h1 className="text-2xl font-black">NexuStaff Touch Clock</h1><p>{status?.location?.name || terminal?.propertyName || 'Terminal not configured'}</p></div>
      <Link href="/clock/setup" className="rounded-xl border px-4 py-3">Terminal setup</Link>
    </header>
    <div className="max-w-xl mx-auto mt-10 space-y-6 bg-white rounded-3xl p-8 shadow-xl">
      {!terminal ? <p>An authorized administrator must <Link href="/clock/setup" className="text-blue-700 underline">configure this terminal</Link> before clocking.</p> : <>
        <p className="text-center font-mono text-xl">{format(now)}</p>
        {step === 'IDLE' && <form onSubmit={verify} className="space-y-5">
          <label className="block font-bold">Employee number
            <input aria-label="Employee number" type="text" autoComplete="off" value={employeeNumber}
              placeholder="EMP-1001" onChange={e => { setEmployeeNumber(e.target.value); touch(); }}
              className="w-full border-2 rounded-xl p-4 mt-2 text-xl" />
          </label>
          <label className="block font-bold">6-digit PIN
            <input aria-label="6-digit PIN" type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={pin}
              onChange={e => { setPin(e.target.value.replace(/\D/g, '').slice(0, 6)); touch(); }}
              className="w-full border-2 rounded-xl p-4 mt-2 text-xl tracking-widest" />
          </label>
          <div className="grid grid-cols-3 gap-3">{['1','2','3','4','5','6','7','8','9','Clear','0','Delete'].map(key =>
            <button key={key} type="button" className="h-16 bg-slate-100 rounded-xl text-xl font-bold" onClick={() => {
              touch(); setPin(value => key === 'Clear' ? '' : key === 'Delete' ? value.slice(0, -1) : (value + key).slice(0, 6));
            }}>{key}</button>)}</div>
          <button disabled={!employeeNumber.trim() || !/^\d{6}$/.test(pin)} className="w-full bg-blue-700 text-white rounded-xl p-4 font-bold disabled:opacity-40">Continue to Punch</button>
        </form>}
        {(step === 'VERIFYING' || step === 'RECORDING') && <p role="status">{step === 'VERIFYING' ? 'Verifying credentials…' : 'Recording punch…'}</p>}
        {step === 'ACTIONS' && status && <section className="space-y-5">
          <h2 className="text-2xl font-bold">{status.employee.displayName}</h2>
          <p>{status.shiftState.currentStatus.replaceAll('_', ' ')}</p>
          {status.shiftState.activeShift && <p>Started: {format(status.shiftState.activeShift.clockInTimestamp)}</p>}
          {status.shiftState.activeShift?.isOverdue && <p>Your previous shift needs administrator review. You may start a new shift here.</p>}
          <div className="grid grid-cols-2 gap-3">{status.shiftState.allowedActions.filter((action: string) => labels[action]).map((action: string) =>
            <button key={action} onClick={() => punch(action)} className="rounded-xl bg-blue-700 text-white p-5 font-bold">{labels[action]}</button>)}</div>
        </section>}
        {step === 'SUCCESS' && confirmation && <section role="status" className="text-center space-y-4">
          <h2 className="text-2xl font-bold text-green-700">Punch confirmed</h2>
          <p>{confirmation.employee.displayName}: {labels[confirmation.punchType]}</p>
          <p>{format(confirmation.timestamp)}</p><p>Returning to the clock in 5 seconds.</p>
        </section>}
        {step === 'ERROR' && <p role="alert" className="text-red-700">{error}</p>}
        {step !== 'IDLE' && <button onClick={reset} className="w-full p-4 rounded-xl bg-slate-100">{step === 'SUCCESS' ? 'Done' : 'Cancel / Reset'}</button>}
      </>}
    </div>
  </main>;
}

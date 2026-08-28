'use client';

import React, { useState, useEffect, useRef } from 'react';
import { MOCK_EMPLOYEES, EmployeeMock } from '@/lib/mock-data';
import { usePunchStore } from '@/store/use-punch-store';
import { formatTime } from '@/lib/utils';
import { audioEngine } from '@/lib/audio-feedback';
import { saveOfflinePunch, getPendingOfflinePunches, syncOfflinePunches } from '@/lib/offline-store';
import {
  CheckCircle2,
  Delete,
  LogIn,
  LogOut,
  Utensils,
  ShieldCheck,
  Sparkles,
  Clock,
  AlertCircle,
  Globe,
  MapPin,
  Camera,
  ShieldAlert,
  WifiOff,
  Wifi,
  RefreshCw,
  Lock,
} from 'lucide-react';

const TRANSLATIONS = {
  es: {
    enterPin: 'Ingresa tu PIN de 6 dígitos',
    empAuthenticated: 'Personal Autenticado',
    empNumber: 'Emp #:',
    position: 'Puesto:',
    scheduledShift: 'Turno Programado:',
    clockIn: 'CLOCK IN (ENTRADA)',
    lunchStart: 'INICIO DE ALMUERZO',
    lunchEnd: 'FIN DE ALMUERZO',
    clockOut: 'CLOCK OUT (SALIDA)',
    notYou: '¿No eres tú? Limpiar PIN',
    clear: 'BORRAR',
    invalidPin: 'PIN de 6 dígitos no encontrado. Inténtalo de nuevo.',
    punchConfirmed: '¡Fichaje Confirmado!',
    resettingKiosk: 'Reiniciando quiosco para el siguiente trabajador...',
    greetings: {
      morning: '¡Buenos días',
      afternoon: '¡Buenas tardes',
      evening: '¡Buenas noches',
    },
  },
  en: {
    enterPin: 'Enter your 6-digit PIN',
    empAuthenticated: 'Authenticated Staff',
    empNumber: 'Emp #:',
    position: 'Position:',
    scheduledShift: 'Scheduled Shift:',
    clockIn: 'CLOCK IN',
    lunchStart: 'START BREAK',
    lunchEnd: 'END BREAK',
    clockOut: 'CLOCK OUT',
    notYou: 'Not you? Clear PIN',
    clear: 'CLEAR',
    invalidPin: '6-digit PIN not found. Please try again.',
    punchConfirmed: 'Punch Confirmed!',
    resettingKiosk: 'Resetting kiosk for the next worker...',
    greetings: {
      morning: 'Good morning',
      afternoon: 'Good afternoon',
      evening: 'Good evening',
    },
  },
};

function getEmployeeAssignedShiftToday(empId: string): { shiftStr: string; schedIn: string; schedOut: string } {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem('nexustaff_schedules');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed[empId]) {
          const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
          const todayName = days[new Date().getDay()];
          const shift = parsed[empId][todayName];
          if (shift && typeof shift === 'string') {
            const parts = shift.split('-');
            return {
              shiftStr: shift,
              schedIn: parts[0]?.trim() || '08:00 AM',
              schedOut: parts[1]?.trim() || '04:30 PM',
            };
          }
        }
      }
    } catch (e) {}
  }
  return {
    shiftStr: '08:00 AM - 04:30 PM',
    schedIn: '08:00 AM',
    schedOut: '04:30 PM',
  };
}

export function PinPad() {
  const [pin, setPin] = useState('');
  const [activeEmp, setActiveEmp] = useState<EmployeeMock | null>(null);
  const [celebrationData, setCelebrationData] = useState<{
    empName: string;
    actionText: string;
    timestamp: string;
    lang: 'es' | 'en';
    photoUrl?: string;
    isOffline?: boolean;
  } | null>(null);
  const [countdown, setCountdown] = useState(3);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [pairedLocation, setPairedLocation] = useState({ id: 'loc-mid', code: 'MID-1001', name: 'Sucursal Centro - MÉRIDA' });

  // Anti-Tamper Brute Force Lockout state
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [isLockedOut, setIsLockedOut] = useState(false);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);

  // Anti Buddy Punching Photo Capture State
  const [cameraActive, setCameraActive] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Offline Mode State
  const [isOnline, setIsOnline] = useState(true);
  const [pendingOfflineCount, setPendingOfflineCount] = useState(0);

  const { punches, addPunch } = usePunchStore();

  // Staff List from API / Mock
  const [staffList, setStaffList] = useState<EmployeeMock[]>(MOCK_EMPLOYEES);

  // Read paired location and fetch staff from API
  useEffect(() => {
    const fetchStaff = async () => {
      try {
        const { staffApi } = await import('@/lib/api-client');
        const data = await staffApi.list();
        if (Array.isArray(data) && data.length > 0) {
          const mapped: EmployeeMock[] = data.map((u: any) => ({
            id: u.id,
            employeeNumber: u.employeeNumber || 'EMP-000',
            firstName: u.firstName || '',
            lastName: u.lastName || '',
            jobPositionCode: u.jobPositionCode || 'STAFF',
            locationId: u.assignments?.[0]?.locationId || 'loc-mid',
            locationCode: 'MID-1001',
            pinCode: u.pinCode || '',
            preferredLanguage: u.preferredLanguage || 'es',
          }));
          setStaffList(mapped);
        }
      } catch (e) {
        console.warn('Using mock employee fallback for PinPad:', e);
      }
    };
    fetchStaff();

    const stored = localStorage.getItem('kiosk_device_location');
    if (stored) {
      try {
        const loc = JSON.parse(stored);
        setPairedLocation({
          id: loc.id || 'loc-mid',
          code: loc.code || 'MID-1001',
          name: loc.name || 'Sucursal Centro - MÉRIDA',
        });
      } catch (e) {}
    }

    // Monitor Online/Offline state
    if (typeof window !== 'undefined') {
      setIsOnline(navigator.onLine);
      const handleOnline = () => {
        setIsOnline(true);
        triggerSync();
      };
      const handleOffline = () => setIsOnline(false);

      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      refreshPendingOfflineCount();

      // Periodic auto-sync every 15s
      const syncInterval = setInterval(() => {
        if (navigator.onLine) {
          triggerSync();
        }
      }, 15000);

      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
        clearInterval(syncInterval);
      };
    }
  }, []);

  const refreshPendingOfflineCount = async () => {
    const pending = await getPendingOfflinePunches();
    setPendingOfflineCount(pending.length);
  };

  const triggerSync = async () => {
    try {
      const { attendanceApi } = await import('@/lib/api-client');
      const res = await syncOfflinePunches((punchData) => attendanceApi.kioskClock(punchData));
      if (res.syncedCount > 0) {
        console.log(`[Offline Sync] Synced ${res.syncedCount} punches from IndexedDB`);
      }
    } catch (e) {}
    refreshPendingOfflineCount();
  };

  // Initialize webcam for Anti Buddy-Punching photo capture
  useEffect(() => {
    let stream: MediaStream | null = null;

    async function initCamera() {
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 320, height: 240, facingMode: 'user' },
          });
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            setCameraActive(true);
          }
        }
      } catch (err) {
        console.warn('Camera access unavailable or denied:', err);
        setCameraActive(false);
      }
    }

    initCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Handle Lockout countdown
  useEffect(() => {
    let timer: any;
    if (isLockedOut && lockoutSeconds > 0) {
      timer = setInterval(() => {
        setLockoutSeconds((prev) => prev - 1);
      }, 1000);
    } else if (isLockedOut && lockoutSeconds === 0) {
      setIsLockedOut(false);
      setFailedAttempts(0);
    }
    return () => clearInterval(timer);
  }, [isLockedOut, lockoutSeconds]);

  // Take photo snapshot from live video stream
  const capturePhotoSnapshot = (): string | undefined => {
    if (!videoRef.current || !canvasRef.current) return undefined;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) return undefined;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const photoData = canvas.toDataURL('image/jpeg', 0.8);
      setCapturedPhoto(photoData);
      return photoData;
    }
    return undefined;
  };

  const lang = activeEmp ? activeEmp.preferredLanguage : 'es';
  const t = TRANSLATIONS[lang];

  const getGreeting = (employeeLang: 'es' | 'en') => {
    const hour = new Date().getHours();
    const g = TRANSLATIONS[employeeLang].greetings;
    if (hour < 12) return g.morning;
    if (hour < 18) return g.afternoon;
    return g.evening;
  };

  const handleKeyPress = (num: string) => {
    if (isLockedOut) return;

    audioEngine.playNumpadClick();

    if (pin.length < 6) {
      const newPin = pin + num;
      setPin(newPin);
      if (newPin.length === 6) {
        const match = staffList.find((e) => e.pinCode === newPin) || MOCK_EMPLOYEES.find((e) => e.pinCode === newPin);
        if (match) {
          audioEngine.playSuccessBeep();
          setActiveEmp(match);
          setFeedbackError(null);
          setFailedAttempts(0);
        } else {
          audioEngine.playErrorBeep();
          const nextFailed = failedAttempts + 1;
          setFailedAttempts(nextFailed);

          if (nextFailed >= 3) {
            audioEngine.playAlarmSound();
            setIsLockedOut(true);
            setLockoutSeconds(45);
            setPin('');
            setFeedbackError('🚨 BLOQUEADO POR SEGURIDAD: 3 intentos de PIN incorrectos.');
          } else {
            setFeedbackError(`${t.invalidPin} (Intento fallido ${nextFailed}/3)`);
            setTimeout(() => {
              setPin('');
              setFeedbackError(null);
            }, 1800);
          }
        }
      }
    }
  };

  const handleClear = () => {
    if (isLockedOut) return;
    audioEngine.playNumpadClick();
    setPin('');
    setActiveEmp(null);
    setFeedbackError(null);
    setCapturedPhoto(null);
  };

  const isPunchLate = (nowDate: Date, scheduledInStr: string): boolean => {
    if (!scheduledInStr) return false;
    const match = scheduledInStr.match(/(\d+):(\d+)\s*(AM|PM)?/i);
    if (!match) return false;
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const ampm = match[3]?.toUpperCase();
    if (ampm === 'PM' && hours < 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;

    const schedDate = new Date(nowDate);
    schedDate.setHours(hours, minutes + 15, 0, 0); // 15 min grace period
    return nowDate.getTime() > schedDate.getTime();
  };

  const handlePunchAction = async (type: 'CLOCK_IN' | 'LUNCH_START' | 'LUNCH_END' | 'CLOCK_OUT') => {
    if (!activeEmp || isLockedOut) return;

    audioEngine.playSuccessBeep();

    const photoSnapshot = capturePhotoSnapshot();
    const now = new Date();
    const timeStr = formatTime(now);
    const labelMap = {
      CLOCK_IN: t.clockIn,
      LUNCH_START: t.lunchStart,
      LUNCH_END: t.lunchEnd,
      CLOCK_OUT: t.clockOut,
    };

    const actionText = labelMap[type];

    // Read REAL Assigned Shift for activeEmp
    const { shiftStr, schedIn, schedOut } = getEmployeeAssignedShiftToday(activeEmp.id);

    // Find existing active punch row for this employee today
    const existingPunch = punches.find((p) => p.userId === activeEmp.id || p.employeeNumber === activeEmp.employeeNumber);

    let updatedPunch: any;

    if (type === 'CLOCK_IN') {
      const isLate = isPunchLate(now, schedIn);
      updatedPunch = {
        id: existingPunch ? existingPunch.id : `kiosk-punch-${Date.now()}`,
        userId: activeEmp.id,
        employeeNumber: activeEmp.employeeNumber,
        employeeName: `${activeEmp.firstName} ${activeEmp.lastName}`,
        jobPositionCode: activeEmp.jobPositionCode,
        locationId: pairedLocation.id,
        locationCode: pairedLocation.code,
        scheduledIn: schedIn,
        scheduledOut: schedOut,
        actualIn: timeStr,
        actualOut: undefined,
        lunchStart: undefined,
        lunchEnd: undefined,
        takenLunch: false,
        calculatedHours: 0.0,
        isOvertime: false,
        status: isLate ? 'LATE' : 'ON_TIME',
      };
    } else if (type === 'LUNCH_START') {
      updatedPunch = {
        ...(existingPunch || {
          id: `kiosk-punch-${Date.now()}`,
          userId: activeEmp.id,
          employeeNumber: activeEmp.employeeNumber,
          employeeName: `${activeEmp.firstName} ${activeEmp.lastName}`,
          jobPositionCode: activeEmp.jobPositionCode,
          locationId: pairedLocation.id,
          locationCode: pairedLocation.code,
          scheduledIn: schedIn,
          scheduledOut: schedOut,
          actualIn: schedIn,
          actualOut: undefined,
        }),
        lunchStart: timeStr,
        takenLunch: true,
      };
    } else if (type === 'LUNCH_END') {
      updatedPunch = {
        ...(existingPunch || {
          id: `kiosk-punch-${Date.now()}`,
          userId: activeEmp.id,
          employeeNumber: activeEmp.employeeNumber,
          employeeName: `${activeEmp.firstName} ${activeEmp.lastName}`,
          jobPositionCode: activeEmp.jobPositionCode,
          locationId: pairedLocation.id,
          locationCode: pairedLocation.code,
          scheduledIn: schedIn,
          scheduledOut: schedOut,
          actualIn: schedIn,
          actualOut: undefined,
          lunchStart: '12:00 PM',
        }),
        lunchEnd: timeStr,
        takenLunch: true,
      };
    } else if (type === 'CLOCK_OUT') {
      updatedPunch = {
        ...(existingPunch || {
          id: `kiosk-punch-${Date.now()}`,
          userId: activeEmp.id,
          employeeNumber: activeEmp.employeeNumber,
          employeeName: `${activeEmp.firstName} ${activeEmp.lastName}`,
          jobPositionCode: activeEmp.jobPositionCode,
          locationId: pairedLocation.id,
          locationCode: pairedLocation.code,
          scheduledIn: schedIn,
          scheduledOut: schedOut,
          actualIn: schedIn,
        }),
        actualOut: timeStr,
        calculatedHours: 8.0,
      };
    }

    // Submit punch IMMEDIATELY to Zustand store & localStorage
    addPunch(updatedPunch);

    // Send REST API punch asynchronously
    try {
      const { attendanceApi } = await import('@/lib/api-client');
      await attendanceApi.kioskClock({
        employee_number: activeEmp.employeeNumber,
        pin_code: pin,
        location_code: pairedLocation.code,
        type,
        photo_url: photoSnapshot,
        device_info: { userAgent: navigator.userAgent },
      }).catch(() => {});
    } catch (err) {}

    setCelebrationData({
      empName: `${activeEmp.firstName} ${activeEmp.lastName}`,
      actionText,
      timestamp: timeStr,
      lang,
      photoUrl: photoSnapshot,
      isOffline: false,
    });
    setCountdown(3);
  };

  useEffect(() => {
    if (celebrationData && countdown > 0) {
      const timer = setInterval(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
      return () => clearInterval(timer);
    } else if (celebrationData && countdown === 0) {
      setCelebrationData(null);
      setPin('');
      setActiveEmp(null);
      setCapturedPhoto(null);
    }
  }, [celebrationData, countdown]);

  const assignedShiftInfo = activeEmp ? getEmployeeAssignedShiftToday(activeEmp.id) : null;

  return (
    <div className="flex flex-col items-center justify-center w-full max-w-md mx-auto relative z-20 font-sans">
      {/* Hidden Canvas & Live Camera Container for Anti-Buddy Punching */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Online / Offline Status Badge Banner */}
      <div className="w-full mb-3 flex items-center justify-between px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 text-[11px] text-slate-400">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-emerald-400 font-bold">
            <Wifi className="h-3.5 w-3.5" /> ONLINE (Servidor Conectado)
          </span>
        </div>

        {pendingOfflineCount > 0 && (
          <button
            onClick={triggerSync}
            className="flex items-center gap-1 bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-lg border border-emerald-500/30 font-mono font-bold cursor-pointer"
          >
            <RefreshCw className="h-3 w-3" /> Fichajes Sincronizados
          </button>
        )}
      </div>

      {/* Camera Live Preview Frame */}
      <div className="w-full mb-4 flex items-center justify-between p-2.5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-md">
        <div className="flex items-center gap-2.5">
          <div className="relative h-11 w-11 rounded-xl bg-slate-950 overflow-hidden border border-slate-700 flex items-center justify-center shrink-0">
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            {!cameraActive && <Camera className="h-5 w-5 text-slate-500 absolute" />}
          </div>
          <div>
            <p className="text-xs font-bold text-white flex items-center gap-1.5">
              <Camera className="h-3.5 w-3.5 text-blue-400" /> Cámara Verificación Anti "Buddy Punching"
            </p>
            <p className="text-[10px] text-slate-400 font-medium">Captura instantánea activa para cada fichaje</p>
          </div>
        </div>
        <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping shrink-0" />
      </div>

      {/* Error / Alert Banner */}
      {feedbackError && !isLockedOut && (
        <div className="w-full mb-4 p-3.5 rounded-2xl bg-rose-600/90 text-white flex items-center gap-3 shadow-xl animate-shake border border-rose-400">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span className="text-xs font-extrabold">{feedbackError}</span>
        </div>
      )}

      {/* ANTI-TAMPER BRUTE FORCE LOCKOUT OVERLAY */}
      {isLockedOut ? (
        <div className="w-full connecteam-glass-card rounded-3xl p-8 shadow-2xl text-center space-y-5 border-2 border-rose-500 animate-pulse bg-rose-950/40">
          <div className="h-20 w-20 rounded-full bg-rose-600/20 text-rose-400 flex items-center justify-center mx-auto border-2 border-rose-500">
            <ShieldAlert className="h-10 w-10 animate-bounce" />
          </div>
          <div>
            <span className="px-3 py-1 rounded-full bg-rose-600/30 text-rose-300 text-xs font-black uppercase tracking-widest border border-rose-500/40">
              QUIOSCO BLOQUEADO (ANTI-TAMPER)
            </span>
            <h2 className="text-2xl font-black text-white tracking-tight mt-3">¡Demasiados Intentos Fallidos!</h2>
            <p className="text-xs text-rose-200 mt-1 font-semibold">
              Se detectaron 3 PINs incorrectos consecutivos. El dispositivo ha sido restringido temporalmente por seguridad.
            </p>
          </div>

          <div className="flex flex-col items-center justify-center py-2">
            <div className="h-16 w-16 rounded-2xl bg-rose-950 border border-rose-800 font-mono font-black text-3xl text-rose-400 flex items-center justify-center shadow-inner">
              {lockoutSeconds}s
            </div>
            <span className="text-[11px] text-slate-400 font-bold uppercase mt-2 flex items-center gap-1">
              <Lock className="h-3.5 w-3.5 text-rose-400" /> Desbloqueo en progreso...
            </span>
          </div>
        </div>
      ) : activeEmp ? (
        <div className="w-full connecteam-glass-card rounded-3xl p-6 shadow-2xl text-center space-y-5 border border-slate-700/80 animate-fade-in">
          <div className="flex items-center justify-between">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-black uppercase tracking-widest border border-emerald-500/30">
              <Sparkles className="h-4 w-4" /> {t.empAuthenticated}
            </div>

            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/20 text-blue-300 text-[10px] font-extrabold border border-blue-500/30 uppercase">
              <Globe className="h-3.5 w-3.5" /> Language: {activeEmp.preferredLanguage.toUpperCase()}
            </div>
          </div>

          <div className="flex flex-col items-center justify-center">
            <div className="h-20 w-20 rounded-full bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 text-white font-black text-3xl flex items-center justify-center shadow-2xl mb-2 border-4 border-white/20 connecteam-glow-blue">
              {activeEmp.firstName.charAt(0)}
              {activeEmp.lastName.charAt(0)}
            </div>
            <p className="text-xs text-blue-400 font-extrabold uppercase tracking-wider">{getGreeting(activeEmp.preferredLanguage)},</p>
            <h2 className="text-3xl font-black text-white tracking-tight">
              {activeEmp.firstName} {activeEmp.lastName}
            </h2>
            <div className="flex items-center gap-2.5 text-xs font-semibold text-slate-300 mt-1.5">
              <span className="font-mono bg-slate-950 px-3 py-1 rounded-lg border border-slate-800 text-white">
                {t.empNumber} {activeEmp.employeeNumber}
              </span>
              <span className="bg-blue-500/20 text-blue-300 px-3 py-1 rounded-lg font-bold border border-blue-500/30">
                {t.position} {activeEmp.jobPositionCode}
              </span>
            </div>
          </div>

          {/* DYNAMIC REAL SHIFT LOOKUP DISPLAY */}
          <div className="flex items-center justify-between px-4 py-3 rounded-2xl bg-slate-950/80 border border-slate-800 text-xs">
            <div className="flex items-center gap-2 text-slate-400 font-semibold">
              <Clock className="h-4 w-4 text-blue-400" />
              <span>{t.scheduledShift}</span>
            </div>
            <span className="font-extrabold text-blue-300 font-mono">
              {assignedShiftInfo?.shiftStr || '08:00 AM - 04:30 PM'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3.5 pt-1">
            <button
              onClick={() => handlePunchAction('CLOCK_IN')}
              className="flex items-center justify-center gap-2 p-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-black text-xs sm:text-sm shadow-xl connecteam-glow-emerald transition-all active:scale-95 cursor-pointer border border-emerald-400/40"
            >
              <LogIn className="h-5 w-5" /> {t.clockIn}
            </button>
            <button
              onClick={() => handlePunchAction('LUNCH_START')}
              className="flex items-center justify-center gap-2 p-4 rounded-2xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white font-black text-xs sm:text-sm shadow-xl connecteam-glow-amber transition-all active:scale-95 cursor-pointer border border-amber-400/40"
            >
              <Utensils className="h-5 w-5" /> {t.lunchStart}
            </button>
            <button
              onClick={() => handlePunchAction('LUNCH_END')}
              className="flex items-center justify-center gap-2 p-4 rounded-2xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-black text-xs sm:text-sm shadow-xl connecteam-glow-blue transition-all active:scale-95 cursor-pointer border border-blue-400/40"
            >
              <Utensils className="h-5 w-5" /> {t.lunchEnd}
            </button>
            <button
              onClick={() => handlePunchAction('CLOCK_OUT')}
              className="flex items-center justify-center gap-2 p-4 rounded-2xl bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 text-white font-black text-xs sm:text-sm shadow-xl connecteam-glow-rose transition-all active:scale-95 cursor-pointer border border-rose-400/40"
            >
              <LogOut className="h-5 w-5" /> {t.clockOut}
            </button>
          </div>

          <button onClick={handleClear} className="text-xs text-slate-400 hover:text-white underline cursor-pointer pt-1">
            {t.notYou}
          </button>
        </div>
      ) : (
        <div className="w-full connecteam-glass-card rounded-3xl p-6 shadow-2xl flex flex-col items-center border border-slate-700/80">
          <div className="flex items-center gap-2 text-slate-300 text-xs font-extrabold uppercase tracking-widest mb-4">
            <ShieldCheck className="h-4.5 w-4.5 text-blue-400" />
            <span>{t.enterPin}</span>
          </div>

          <div className="flex gap-3 mb-6">
            {[0, 1, 2, 3, 4, 5].map((idx) => (
              <div
                key={idx}
                className={`h-5 w-5 rounded-full border-2 transition-all duration-200 ${
                  pin.length > idx
                    ? 'bg-blue-500 border-blue-400 scale-125 connecteam-glow-blue'
                    : 'border-slate-700 bg-slate-950/80'
                }`}
              />
            ))}
          </div>

          <div className="grid grid-cols-3 gap-3.5 w-full max-w-xs">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
              <button
                key={num}
                onClick={() => handleKeyPress(num)}
                className="h-16 rounded-2xl bg-slate-900 hover:bg-blue-600 text-white text-2xl font-black transition-all active:scale-95 shadow-lg flex items-center justify-center border border-slate-700/80 hover:border-blue-400 cursor-pointer kiosk-btn-3d"
              >
                {num}
              </button>
            ))}
            <button
              onClick={handleClear}
              className="h-16 rounded-2xl bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-white text-xs font-extrabold tracking-wider transition-all flex items-center justify-center border border-slate-800 cursor-pointer"
            >
              {t.clear}
            </button>
            <button
              onClick={() => handleKeyPress('0')}
              className="h-16 rounded-2xl bg-slate-900 hover:bg-blue-600 text-white text-2xl font-black transition-all active:scale-95 shadow-lg flex items-center justify-center border border-slate-700/80 hover:border-blue-400 cursor-pointer kiosk-btn-3d"
            >
              0
            </button>
            <button
              onClick={() => {
                audioEngine.playNumpadClick();
                setPin(pin.slice(0, -1));
              }}
              className="h-16 rounded-2xl bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-white text-xs font-bold transition-all flex items-center justify-center border border-slate-800 cursor-pointer"
            >
              <Delete className="h-6 w-6" />
            </button>
          </div>
        </div>
      )}

      {/* CELEBRATION MODAL WITH ANTI-BUDDY PUNCHING SNAPSHOT */}
      {celebrationData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-xl animate-fade-in">
          <div className="w-full max-w-md connecteam-glass-card rounded-3xl p-8 shadow-2xl text-center space-y-5 border-2 border-emerald-500/50 relative overflow-hidden">
            <div className="relative flex justify-center items-center gap-4 my-2">
              <div className="h-20 w-20 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center animate-pulse connecteam-glow-emerald">
                <CheckCircle2 className="h-12 w-12 text-emerald-400" />
              </div>

              {/* Captured Photo Snapshot Preview */}
              {celebrationData.photoUrl && (
                <div className="relative h-20 w-20 rounded-2xl overflow-hidden border-2 border-blue-400 shadow-lg shrink-0">
                  <img src={celebrationData.photoUrl} alt="Photo Verification" className="w-full h-full object-cover" />
                  <span className="absolute bottom-0 inset-x-0 bg-blue-600/90 text-white text-[8px] font-black uppercase text-center py-0.5">
                    VERIFIED
                  </span>
                </div>
              )}
            </div>

            <div>
              <span className="text-xs font-black uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
                {TRANSLATIONS[celebrationData.lang].punchConfirmed}
              </span>
              <h2 className="text-3xl font-black text-white tracking-tight mt-3">{celebrationData.empName}</h2>
              <p className="text-base font-bold text-emerald-300 mt-1">{celebrationData.actionText}</p>

              <p className="text-xs text-emerald-400 font-bold bg-emerald-500/20 px-3 py-1 rounded-xl border border-emerald-500/30 mt-2 inline-block">
                ✅ Fichaje Registrado y Confirmado en Asistencias
              </p>

              <p className="text-xs text-slate-400 font-mono mt-1">Exact Time: {celebrationData.timestamp}</p>
              <p className="text-[10px] text-blue-400 font-semibold mt-1 flex items-center justify-center gap-1">
                <MapPin className="h-3 w-3" /> Branch Recorded: {pairedLocation.name}
              </p>
            </div>

            <div className="flex flex-col items-center justify-center pt-2">
              <div className="h-10 w-10 rounded-full bg-slate-900 border border-slate-800 font-mono font-black text-lg text-blue-400 flex items-center justify-center">
                {countdown}
              </div>
              <span className="text-[10px] text-slate-500 font-bold uppercase mt-1">
                {TRANSLATIONS[celebrationData.lang].resettingKiosk}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

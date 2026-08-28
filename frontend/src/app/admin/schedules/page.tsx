'use client';

import React, { useState, useEffect } from 'react';
import { MOCK_EMPLOYEES, EmployeeMock } from '@/lib/mock-data';
import { useLocationStore, isLocationMatching } from '@/store/use-location-store';
import {
  Calendar as CalendarIcon,
  Plus,
  Clock,
  User,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  AlertCircle,
  GripVertical,
  X,
  FileSpreadsheet,
  Sun,
  Moon,
  Sunset,
  Zap,
  Coffee,
  Check,
  Trash2,
  RotateCcw,
} from 'lucide-react';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const SHIFT_PRESETS = [
  { label: 'Turno Mañana', time: '08:00 AM - 04:30 PM', startTime24: '08:00', endTime24: '16:30', icon: Sun, color: 'bg-blue-600/20 text-blue-300 border-blue-500/40 hover:bg-blue-600/30' },
  { label: 'Turno Tarde', time: '01:00 PM - 09:30 PM', startTime24: '13:00', endTime24: '21:30', icon: Sunset, color: 'bg-amber-600/20 text-amber-300 border-amber-500/40 hover:bg-amber-600/30' },
  { label: 'Turno Noche', time: '10:00 PM - 06:30 AM', startTime24: '22:00', endTime24: '06:30', icon: Moon, color: 'bg-indigo-600/20 text-indigo-300 border-indigo-500/40 hover:bg-indigo-600/30' },
  { label: 'Turno 12 Horas', time: '07:00 AM - 07:30 PM', startTime24: '07:00', endTime24: '19:30', icon: Zap, color: 'bg-purple-600/20 text-purple-300 border-purple-500/40 hover:bg-purple-600/30' },
];

function format24to12(time24: string): string {
  if (!time24) return '08:00 AM';
  const [hStr, mStr] = time24.split(':');
  let h = parseInt(hStr || '8', 10);
  const m = mStr || '00';
  const period = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  const hDisplay = h < 10 ? `0${h}` : `${h}`;
  return `${hDisplay}:${m} ${period}`;
}

function parse12to24Single(single12Str: string): string {
  if (!single12Str) return '08:00';
  const clean = single12Str.trim();
  const parts = clean.split(' ');
  if (parts.length < 2) return '08:00';
  const timePart = parts[0];
  const period = parts[1].toUpperCase();
  const [hStr, mStr] = timePart.split(':');
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr || '0', 10);
  if (isNaN(h)) return '08:00';

  if (period === 'PM' && h < 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;

  const hDisplay = h < 10 ? `0${h}` : `${h}`;
  const mDisplay = m < 10 ? `0${m}` : `${m}`;
  return `${hDisplay}:${mDisplay}`;
}

function parseShiftStringTo24(shiftStr?: string): { start24: string; end24: string } {
  if (!shiftStr) return { start24: '08:00', end24: '16:30' };
  const parts = shiftStr.split('-');
  if (parts.length < 2) return { start24: '08:00', end24: '16:30' };
  return {
    start24: parse12to24Single(parts[0]),
    end24: parse12to24Single(parts[1]),
  };
}

export default function SchedulesPage() {
  const { selectedLocationId } = useLocationStore();
  const [employees, setEmployees] = useState<EmployeeMock[]>(MOCK_EMPLOYEES);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showClearConfirmModal, setShowClearConfirmModal] = useState(false);
  const [overlapWarning, setOverlapWarning] = useState<string | null>(null);

  // Active Selected Template (Brush for 1-Tap Click Cell Assignment)
  const [activePreset, setActivePreset] = useState<string | null>(null);

  // Dynamic Shift Map (EmpID -> Day -> Shift Time String)
  const [shiftData, setShiftData] = useState<{ [key: string]: { [day: string]: string } }>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('nexustaff_schedules');
        if (stored !== null) {
          const parsed = JSON.parse(stored);
          if (parsed && typeof parsed === 'object') return parsed;
        }
      } catch (e) {}
    }
    return {
      'emp-101': { Monday: '08:00 AM - 04:30 PM', Tuesday: '08:00 AM - 04:30 PM', Wednesday: '08:00 AM - 04:30 PM', Thursday: '08:00 AM - 04:30 PM', Friday: '08:00 AM - 04:30 PM' },
      'emp-102': { Monday: '08:00 AM - 04:30 PM', Tuesday: '08:00 AM - 04:30 PM', Wednesday: '08:00 AM - 04:30 PM', Thursday: '08:00 AM - 04:30 PM', Friday: '08:00 AM - 04:30 PM' },
    };
  });

  const [formData, setFormData] = useState({
    empId: '',
    day: 'Monday',
    startTime24: '08:00',
    endTime24: '16:30',
  });

  // Save schedules to localStorage whenever shiftData changes
  const saveShiftDataState = (updated: { [key: string]: { [day: string]: string } }) => {
    setShiftData(updated);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('nexustaff_schedules', JSON.stringify(updated));
        localStorage.setItem('nexustaff_schedules_modified', 'true');
      } catch (e) {}
    }
  };

  // Clear all shifts for current location
  const handleClearAllShifts = () => {
    saveShiftDataState({});
    setShowClearConfirmModal(false);
    setOverlapWarning('🗑️ Todos los turnos de la sucursal han sido eliminados.');
    setTimeout(() => setOverlapWarning(null), 4000);
  };

  // Fetch Schedules & Employees from API
  useEffect(() => {
    async function loadData() {
      try {
        const { schedulesApi, staffApi } = await import('@/lib/api-client');
        const [list, staffData] = await Promise.all([
          schedulesApi.list().catch(() => []),
          staffApi.list().catch(() => []),
        ]);

        if (Array.isArray(staffData) && staffData.length > 0) {
          const mapped: EmployeeMock[] = staffData.map((u: any) => {
            const locCode =
              u.assignments?.[0]?.location?.locationCode ||
              u.locationCode ||
              (u.id === 'emp-103' || u.employeeNumber === 'EMP-1003' ? 'CUN-1002' : u.id === 'emp-104' || u.employeeNumber === 'EMP-1004' ? 'MTY-1003' : 'MID-1001');
            const locId =
              u.assignments?.[0]?.locationId ||
              u.locationId ||
              (locCode.startsWith('CUN') ? 'loc-cun' : locCode.startsWith('MTY') ? 'loc-mty' : 'loc-mid');

            return {
              id: u.id,
              employeeNumber: u.employeeNumber || 'EMP-000',
              firstName: u.firstName || '',
              lastName: u.lastName || '',
              jobPositionCode: u.jobPositionCode || 'STAFF',
              locationId: locId,
              locationCode: locCode,
              pinCode: u.pinCode || '123456',
              preferredLanguage: u.preferredLanguage || 'es',
            };
          });
          setEmployees(mapped);
        }

        const isUserModified = typeof window !== 'undefined' && localStorage.getItem('nexustaff_schedules_modified') === 'true';

        if (!isUserModified && Array.isArray(list) && list.length > 0) {
          const map: { [key: string]: { [day: string]: string } } = {};
          list.forEach((item: any) => {
            const empId = item.userId;
            if (!map[empId]) map[empId] = {};
            const d = new Date(item.scheduledIn);
            const dayName = DAYS[d.getDay() === 0 ? 6 : d.getDay() - 1] || 'Monday';
            const inTime = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const outTime = new Date(item.scheduledOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            map[empId][dayName] = `${inTime} - ${outTime}`;
          });
          setShiftData((prev) => {
            const merged = { ...prev, ...map };
            if (typeof window !== 'undefined') {
              localStorage.setItem('nexustaff_schedules', JSON.stringify(merged));
            }
            return merged;
          });
        }
      } catch (e) {
        console.warn('Could not fetch schedules from backend API:', e);
      }
    }
    loadData();
  }, []);

  const filteredEmployees = employees.filter((emp) => {
    if (emp.jobPositionCode === 'SUPER_ADMIN' || emp.employeeNumber?.startsWith('ADM-')) {
      return false;
    }
    return isLocationMatching(emp.locationId, emp.locationCode, selectedLocationId);
  });

  // Check for shift collision / overlap
  const checkOverlap = (empId: string, day: string, newTime: string): boolean => {
    const existing = shiftData[empId]?.[day];
    if (existing && existing !== newTime) {
      const emp = employees.find((e) => e.id === empId);
      const empName = emp ? `${emp.firstName} ${emp.lastName}` : 'el trabajador';
      setOverlapWarning(
        `🚨 CONFLICTO DETECTADO: ${empName} ya tiene asignado el horario "${existing}" el ${day}. No se pueden solapar turnos en el mismo día.`
      );
      setTimeout(() => setOverlapWarning(null), 5000);
      return true;
    }
    return false;
  };

  const assignShiftToEmpDay = async (empId: string, day: string, time: string) => {
    if (checkOverlap(empId, day, time)) return;

    const emp = employees.find((e) => e.id === empId || e.employeeNumber === empId);
    const empKey = emp?.id || empId;
    const empNumKey = emp?.employeeNumber;

    const updated = { ...shiftData };
    if (!updated[empKey]) updated[empKey] = {};
    updated[empKey][day] = time;
    if (empNumKey) {
      if (!updated[empNumKey]) updated[empNumKey] = {};
      updated[empNumKey][day] = time;
    }
    saveShiftDataState(updated);
    setOverlapWarning(null);

    // Persist to REST API asynchronously
    try {
      const { schedulesApi } = await import('@/lib/api-client');
      const now = new Date();
      await schedulesApi.create({
        userId: empKey,
        locationId: selectedLocationId === 'ALL' ? 'loc-mid' : selectedLocationId,
        scheduledIn: now.toISOString(),
        scheduledOut: new Date(now.getTime() + 8.5 * 3600000).toISOString(),
        status: 'SCHEDULED',
      });
    } catch (e) {}
  };

  const handleOpenAssignModalForCell = (empId: string, day: string) => {
    if (activePreset) {
      // 1-Tap Brush Assignment
      assignShiftToEmpDay(empId, day, activePreset);
      return;
    }

    const existingShift = shiftData[empId]?.[day];
    const { start24, end24 } = parseShiftStringTo24(existingShift);

    setFormData({
      empId,
      day,
      startTime24: start24,
      endTime24: end24,
    });
    setShowAssignModal(true);
  };

  const handleApplyPresetInModal = (preset: typeof SHIFT_PRESETS[0]) => {
    const targetEmpId = formData.empId || filteredEmployees[0]?.id;
    if (!targetEmpId) return;

    assignShiftToEmpDay(targetEmpId, formData.day, preset.time);
    setShowAssignModal(false);
  };

  const handleAssignShiftSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const targetEmpId = formData.empId || filteredEmployees[0]?.id;
    if (!targetEmpId) return;

    if (formData.startTime24 === formData.endTime24) {
      setOverlapWarning('⚠️ La hora de entrada y salida no pueden ser idénticas.');
      return;
    }

    const timeStr = `${format24to12(formData.startTime24)} - ${format24to12(formData.endTime24)}`;
    assignShiftToEmpDay(targetEmpId, formData.day, timeStr);
    setShowAssignModal(false);
  };

  const handleRemoveShift = (empId: string, day: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const updated = { ...shiftData };
    if (updated[empId]) {
      delete updated[empId][day];
      saveShiftDataState(updated);
    }
    setShowAssignModal(false);
  };

  const isOvernightShift = formData.startTime24 > formData.endTime24 && formData.startTime24 !== formData.endTime24;
  const isSameTimeShift = formData.startTime24 === formData.endTime24;

  return (
    <div className="space-y-6 font-sans">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-xl">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs font-black uppercase tracking-widest mb-2">
            <CalendarIcon className="h-3.5 w-3.5" /> SHIFT SCHEDULE MANAGEMENT
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">Planificación de Turnos y Horarios</h1>
          <p className="text-xs text-slate-400 font-medium">
            Asigna horarios semanales fácilmente con plantillas rápidas o selectores táctiles sin necesidad de escribir texto.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowClearConfirmModal(true)}
            className="flex items-center gap-2 bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800 font-bold text-xs px-3.5 py-2.5 rounded-xl transition-all cursor-pointer"
            title="Limpiar todos los turnos asignados de la sucursal"
          >
            <RotateCcw className="h-4 w-4 text-rose-400" /> Vaciar Todos los Turnos
          </button>

          <button
            onClick={() => {
              if (filteredEmployees.length > 0) {
                setFormData({
                  empId: filteredEmployees[0].id,
                  day: 'Monday',
                  startTime24: '08:00',
                  endTime24: '16:30',
                });
              }
              setShowAssignModal(true);
            }}
            className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl shadow-lg transition-all active:scale-95 cursor-pointer"
          >
            <Plus className="h-4 w-4" /> Asignar Nuevo Turno
          </button>
        </div>
      </div>

      {/* Collision Overlap Warning Banner */}
      {overlapWarning && (
        <div className="p-4 rounded-2xl bg-rose-600/90 text-white flex items-center justify-between shadow-xl border border-rose-400 animate-shake">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span className="text-xs font-bold">{overlapWarning}</span>
          </div>
          <button onClick={() => setOverlapWarning(null)} className="text-white/80 hover:text-white p-1">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* 1-TAP SHIFT TEMPLATE PRESETS BAR */}
      <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl shadow-lg space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-extrabold text-slate-300 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-400" /> Plantillas de Asignación Rápida (Táctil y Celular)
          </span>
          {activePreset && (
            <button
              onClick={() => setActivePreset(null)}
              className="text-[11px] font-bold text-rose-400 hover:text-rose-300 underline cursor-pointer"
            >
              Desactivar Pincel Rápido
            </button>
          )}
        </div>
        <p className="text-[11px] text-slate-400 font-medium">
          Haz clic en un turno prestablecido para activarlo y luego toca cualquier celda en la tabla para asignarlo de inmediato en 1 toque.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
          {SHIFT_PRESETS.map((preset) => {
            const Icon = preset.icon;
            const isSelected = activePreset === preset.time;
            return (
              <button
                key={preset.label}
                onClick={() => setActivePreset(isSelected ? null : preset.time)}
                className={`p-3 rounded-2xl border text-left transition-all active:scale-95 cursor-pointer flex items-center justify-between ${preset.color} ${
                  isSelected ? 'ring-2 ring-blue-400 scale-[1.02] shadow-xl' : ''
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-xl bg-slate-950/60 border border-white/10">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-black tracking-tight">{preset.label}</p>
                    <p className="text-[10px] font-mono opacity-90">{preset.time}</p>
                  </div>
                </div>
                {isSelected && <Check className="h-4 w-4 text-blue-400 shrink-0" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Weekly Schedule Grid Table */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-slate-950/80 border-b border-slate-800 text-xs font-extrabold text-slate-400 uppercase tracking-wider">
                <th className="p-4 w-56 sticky left-0 bg-slate-950/95 border-r border-slate-800 z-10">Personal</th>
                {DAYS.map((day) => (
                  <th key={day} className="p-4 text-center border-r border-slate-800/60 min-w-[140px]">
                    {day}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs">
              {filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-500 font-bold">
                    No se encontraron trabajadores en esta sucursal para asignar turnos.
                  </td>
                </tr>
              ) : (
                filteredEmployees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-slate-800/30 transition-colors">
                    {/* Employee Profile Cell */}
                    <td className="p-4 sticky left-0 bg-slate-900 border-r border-slate-800 z-10">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-bold text-xs flex items-center justify-center border border-white/20 shrink-0">
                          {emp.firstName.charAt(0)}
                          {emp.lastName.charAt(0)}
                        </div>
                        <div className="truncate">
                          <p className="font-extrabold text-white truncate">
                            {emp.firstName} {emp.lastName}
                          </p>
                          <p className="text-[10px] text-slate-400 font-mono">
                            {emp.employeeNumber} · <span className="text-blue-400 font-bold">{emp.jobPositionCode}</span>
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Schedule Day Drop / Click Cells */}
                    {DAYS.map((day) => {
                      const shift = shiftData[emp.id]?.[day] || shiftData[emp.employeeNumber]?.[day];
                      return (
                        <td
                          key={day}
                          onClick={() => handleOpenAssignModalForCell(emp.id, day)}
                          className="p-2 border-r border-slate-800/60 text-center relative group min-h-[60px] cursor-pointer hover:bg-slate-800/50 transition-colors"
                        >
                          {shift ? (
                            <div className="p-2.5 rounded-xl bg-blue-950/70 border border-blue-500/40 text-blue-300 font-mono text-[11px] font-bold shadow-inner relative flex items-center justify-between">
                              <span className="truncate">{shift}</span>
                              <button
                                onClick={(e) => handleRemoveShift(emp.id, day, e)}
                                className="h-5 w-5 rounded-full bg-rose-600/90 hover:bg-rose-500 text-white flex items-center justify-center transition-opacity shadow-md cursor-pointer ml-1 shrink-0"
                                title="Eliminar turno"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ) : (
                            <div className="h-11 rounded-xl border border-dashed border-slate-800 hover:border-blue-500/50 flex items-center justify-center text-slate-500 hover:text-blue-400 text-[10px] font-extrabold transition-colors">
                              <span>+ Asignar</span>
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CLEAR ALL SHIFTS CONFIRMATION MODAL */}
      {showClearConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in font-sans">
          <div className="w-full max-w-md bg-slate-900 border border-rose-800/60 rounded-3xl p-6 shadow-2xl space-y-4 text-center">
            <div className="h-14 w-14 rounded-full bg-rose-600/20 text-rose-400 flex items-center justify-center mx-auto border border-rose-500/30">
              <Trash2 className="h-7 w-7" />
            </div>
            <div>
              <h3 className="text-lg font-black text-white">¿Vaciar todos los turnos?</h3>
              <p className="text-xs text-slate-400 mt-1 font-medium">
                Esta acción eliminará todos los turnos asignados actualmente en esta sucursal. Podrás volver a asignar nuevos turnos en cualquier momento.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => setShowClearConfirmModal(false)}
                className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold hover:bg-slate-700 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleClearAllShifts}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black shadow-lg cursor-pointer"
              >
                Sí, Vaciar Todos
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EASY 1-TAP TOUCH ASSIGNMENT MODAL (PRE-FILLED WITH CURRENT SHIFT TIME) */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in font-sans">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                  <Clock className="h-5 w-5 text-blue-400" /> Editar / Asignar Turno de Trabajo
                </h3>
                <p className="text-xs text-slate-400 font-medium">Horario actual precargado para modificación inmediata</p>
              </div>
              <button onClick={() => setShowAssignModal(false)} className="text-slate-400 hover:text-white p-1">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Select Employee & Day */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-slate-400 font-bold mb-1">Trabajador</label>
                <select
                  value={formData.empId || filteredEmployees[0]?.id || ''}
                  onChange={(e) => setFormData({ ...formData, empId: e.target.value })}
                  className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-semibold"
                >
                  {filteredEmployees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.firstName} {emp.lastName} ({emp.jobPositionCode})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 font-bold mb-1">Día de la Semana</label>
                <select
                  value={formData.day}
                  onChange={(e) => setFormData({ ...formData, day: e.target.value })}
                  className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-semibold"
                >
                  {DAYS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* SECTION A: 1-TAP PRESET BUTTONS */}
            <div className="space-y-2 pt-1 border-t border-slate-800">
              <label className="block text-slate-300 font-extrabold text-xs flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-amber-400" /> Opción 1: Seleccionar Turno Predefinido (1 toque)
              </label>
              <div className="grid grid-cols-2 gap-2">
                {SHIFT_PRESETS.map((preset) => {
                  const Icon = preset.icon;
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => handleApplyPresetInModal(preset)}
                      className={`p-3 rounded-2xl border text-left flex items-center gap-2.5 transition-all active:scale-95 cursor-pointer ${preset.color}`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <div>
                        <p className="text-xs font-black">{preset.label}</p>
                        <p className="text-[10px] font-mono opacity-90">{preset.time}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* SECTION B: TIME PICKERS (NATIVE CLOCK POP-UP) */}
            <form onSubmit={handleAssignShiftSubmit} className="space-y-4 pt-2 border-t border-slate-800 text-xs">
              <div className="flex items-center justify-between">
                <label className="block text-slate-300 font-extrabold flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-blue-400" /> Opción 2: Horario Personalizado (Selector Táctil)
                </label>

                {isOvernightShift && (
                  <span className="text-[10px] font-black text-purple-300 bg-purple-500/20 px-2.5 py-0.5 rounded-md border border-purple-500/30 flex items-center gap-1">
                    <Moon className="h-3 w-3" /> Nocturno (Cruza Medianoche)
                  </span>
                )}
                {isSameTimeShift && (
                  <span className="text-[10px] font-black text-rose-300 bg-rose-500/20 px-2.5 py-0.5 rounded-md border border-rose-500/30 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> Horas Idénticas
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-bold mb-1">Hora Inicio Entrada</label>
                  <input
                    type="time"
                    required
                    value={formData.startTime24}
                    onChange={(e) => setFormData({ ...formData, startTime24: e.target.value })}
                    className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-center text-sm font-bold cursor-pointer"
                  />
                  <p className="text-[10px] text-slate-400 font-extrabold text-center mt-1">
                    Formato: <span className="text-blue-400">{format24to12(formData.startTime24)}</span>
                  </p>
                </div>

                <div>
                  <label className="block text-slate-400 font-bold mb-1">Hora Fin Salida</label>
                  <input
                    type="time"
                    required
                    value={formData.endTime24}
                    onChange={(e) => setFormData({ ...formData, endTime24: e.target.value })}
                    className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-center text-sm font-bold cursor-pointer"
                  />
                  <p className="text-[10px] text-slate-400 font-extrabold text-center mt-1">
                    Formato: <span className="text-blue-400">{format24to12(formData.endTime24)}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-800">
                {shiftData[formData.empId]?.[formData.day] ? (
                  <button
                    type="button"
                    onClick={() => handleRemoveShift(formData.empId, formData.day)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-600/20 text-rose-300 hover:bg-rose-600/30 border border-rose-500/30 text-xs font-bold cursor-pointer transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Eliminar Turno
                  </button>
                ) : (
                  <div />
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAssignModal(false)}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 font-bold cursor-pointer hover:bg-slate-700"
                  >
                    Cancelar
                  </button>
                  <button type="submit" className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black cursor-pointer shadow-lg">
                    Guardar Horario Personalizado
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

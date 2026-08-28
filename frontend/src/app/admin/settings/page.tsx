'use client';

import React, { useState } from 'react';
import { useAuthStore } from '@/store/use-auth-store';
import Link from 'next/link';
import { Settings, ShieldCheck, Clock, Save, Lock, ShieldAlert, FileText, Search, Eye, Filter, Server } from 'lucide-react';

interface MockAuditLog {
  id: string;
  timestamp: string;
  actorName: string;
  actorRole: string;
  action: 'PUNCH_EDIT' | 'EMPLOYEE_UPDATE' | 'KIOSK_LOCKOUT' | 'SHIFT_CHANGE';
  targetEntity: string;
  ipAddress: string;
  userAgent: string;
  details: string;
}

const MOCK_AUDIT_LOGS: MockAuditLog[] = [
  {
    id: 'log-101',
    timestamp: '2026-08-14 03:45:12',
    actorName: 'Super Admin (Arthur Pendelton)',
    actorRole: 'SUPER_ADMIN',
    action: 'PUNCH_EDIT',
    targetEntity: 'AttendanceLog #punch-8842',
    ipAddress: '192.168.1.104',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    details: 'Modificó hora de entrada de 08:25 AM a 08:00 AM para el empleado #1001 (John Doe). Motivo: Justificación médica.',
  },
  {
    id: 'log-102',
    timestamp: '2026-08-14 02:15:00',
    actorName: 'Sistema Quiosco (Quiosco MID-1001)',
    actorRole: 'KIOSK_DEVICE',
    action: 'KIOSK_LOCKOUT',
    targetEntity: 'Kiosk Device Tablet #2',
    ipAddress: '203.0.113.45',
    userAgent: 'NexuStaff Kiosk TouchApp/2.4',
    details: 'Activación de bloqueo por fuerza bruta anti-tamper (3 intentos de PIN erróneos). Quiosco restringido por 45 segundos.',
  },
  {
    id: 'log-103',
    timestamp: '2026-08-13 18:30:22',
    actorName: 'Admin Sucursal (María López)',
    actorRole: 'LOCATION_ADMIN',
    action: 'EMPLOYEE_UPDATE',
    targetEntity: 'User #emp-104',
    ipAddress: '192.168.1.188',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    details: 'Actualizó tarifa por hora de $18.50 a $22.00 MXN para el puesto de Cocina (JC_POS: COOK).',
  },
  {
    id: 'log-104',
    timestamp: '2026-08-13 14:10:05',
    actorName: 'Super Admin (Arthur Pendelton)',
    actorRole: 'SUPER_ADMIN',
    action: 'SHIFT_CHANGE',
    targetEntity: 'ShiftSchedule #sched-332',
    ipAddress: '192.168.1.104',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    details: 'Reasignó turno de Miércoles de 08:00 AM - 04:30 PM a 02:00 PM - 10:30 PM para Jane Smith.',
  },
];

export default function SettingsPage() {
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN' && user?.email === 'admin@nexustaff.com';

  const [overtimeThreshold, setOvertimeThreshold] = useState('8.0');
  const [gracePeriod, setGracePeriod] = useState('15');
  const [lunchDuration, setLunchDuration] = useState('30');
  const [saved, setSaved] = useState(false);

  // Audit Log State
  const [auditLogs, setAuditLogs] = useState<MockAuditLog[]>(MOCK_AUDIT_LOGS);
  const [searchIp, setSearchIp] = useState('');
  const [actionFilter, setActionFilter] = useState('ALL');
  const [selectedDetailLog, setSelectedDetailLog] = useState<MockAuditLog | null>(null);

  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8 space-y-4 font-sans">
        <div className="h-16 w-16 rounded-3xl bg-rose-500/10 text-rose-400 flex items-center justify-center border border-rose-500/20 shadow-xl">
          <ShieldAlert className="h-8 w-8" />
        </div>
        <h2 className="text-xl font-black text-white">Acceso Restringido - Exclusivo SuperAdmin</h2>
        <p className="text-xs text-slate-400 max-w-md">
          El módulo de Configuración de Sistema y Auditorías de Seguridad está reservado únicamente para Administradores Generales.
        </p>
        <Link href="/admin" className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white transition-all shadow-md">
          Volver al Panel Principal
        </Link>
      </div>
    );
  }

  React.useEffect(() => {
    async function loadAuditLogs() {
      try {
        const { auditApi } = await import('@/lib/api-client');
        const res = await auditApi.list();
        if (res && Array.isArray(res.data) && res.data.length > 0) {
          const mapped: MockAuditLog[] = res.data.map((item: any) => ({
            id: item.id,
            timestamp: new Date(item.createdAt).toLocaleString(),
            actorName: item.user ? `${item.user.firstName} ${item.user.lastName}` : 'Sistema',
            actorRole: item.user?.role || 'SYSTEM',
            action: item.action || 'PUNCH_EDIT',
            targetEntity: item.targetEntity || 'System',
            ipAddress: item.ipAddress || '127.0.0.1',
            userAgent: item.userAgent || 'Web Browser',
            details: typeof item.details === 'string' ? item.details : JSON.stringify(item.details || {}),
          }));
          setAuditLogs(mapped);
        }
      } catch (e) {
        console.warn('Could not fetch audit logs from backend API:', e);
      }
    }
    loadAuditLogs();
  }, []);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const filteredLogs = auditLogs.filter((log) => {
    const matchIp = !searchIp || log.ipAddress.includes(searchIp) || log.actorName.toLowerCase().includes(searchIp.toLowerCase());
    const matchAction = actionFilter === 'ALL' || log.action === actionFilter;
    return matchIp && matchAction;
  });

  return (
    <div className="space-y-8 font-sans max-w-6xl">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
          Configuración &amp; Auditoría de Seguridad <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">Super Admin</span>
        </h2>
        <p className="text-xs text-slate-400 font-medium">
          Parámetros globales del sistema, Rate Limiting contra ciberataques DDoS y Visualizador de Logs de Auditoría.
        </p>
      </div>

      {saved && (
        <div className="p-4 rounded-2xl bg-emerald-600/90 text-white flex items-center gap-3 shadow-lg animate-bounce border border-emerald-400 text-xs font-bold">
          <ShieldCheck className="h-5 w-5" /> Configuración guardada correctamente.
        </div>
      )}

      {/* CARD 1: RATE LIMITING & SECURITY GUARDIAN */}
      <div className="connecteam-glass-card rounded-3xl p-6 border border-slate-800 space-y-4 text-white">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <Server className="h-5 w-5 text-emerald-400" />
            <h3 className="text-base font-extrabold">Rate Limiting Backend (@nestjs/throttler)</h3>
          </div>
          <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 font-mono text-xs font-bold border border-emerald-500/30">
            PROTECCIÓN ACTIVA (100 req/min por IP)
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-1">
            <span className="text-[10px] text-slate-400 font-bold uppercase">Límite por Ventana</span>
            <p className="text-sm font-black text-white font-mono">100 peticiones / 60 segundos</p>
          </div>
          <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-1">
            <span className="text-[10px] text-slate-400 font-bold uppercase">Módulo Guardián</span>
            <p className="text-sm font-black text-emerald-400 font-mono">ThrottlerGuard Activo</p>
          </div>
          <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-1">
            <span className="text-[10px] text-slate-400 font-bold uppercase">Estado Anti-DDoS</span>
            <p className="text-sm font-black text-blue-400 font-mono">Protegido contra Inundación</p>
          </div>
        </div>
      </div>

      {/* CARD 2: AUDIT LOG VISUALIZER SCREEN */}
      <div className="connecteam-glass-card rounded-3xl p-6 border border-slate-800 space-y-5 text-white">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <FileText className="h-5 w-5 text-blue-400" />
            <div>
              <h3 className="text-base font-extrabold">Visualizador de Logs de Auditoría (Audit Trail)</h3>
              <p className="text-xs text-slate-400">Auditoría completa de quién modificó horas, editó empleados o direcciones IP asociadas.</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            {/* IP / Actor Search input */}
            <div className="relative flex-1 sm:w-64">
              <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Buscar por IP o usuario..."
                value={searchIp}
                onChange={(e) => setSearchIp(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500"
              />
            </div>

            {/* Action Filter dropdown */}
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
            >
              <option value="ALL">Todas las Acciones</option>
              <option value="PUNCH_EDIT">Edición de Fichaje</option>
              <option value="EMPLOYEE_UPDATE">Edición de Empleado</option>
              <option value="KIOSK_LOCKOUT">Bloqueo Quiosco</option>
              <option value="SHIFT_CHANGE">Cambio de Horario</option>
            </select>
          </div>
        </div>

        {/* Audit Table */}
        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-900 text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3.5">TIMESTAMP</th>
                  <th className="px-4 py-3.5">USUARIO / ACTOR</th>
                  <th className="px-4 py-3.5">ACCIÓN</th>
                  <th className="px-4 py-3.5">DIRECCIÓN IP</th>
                  <th className="px-4 py-3.5">ENTIDAD OBJETIVO</th>
                  <th className="px-4 py-3.5 text-center">DETALLES</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-800/50 transition-colors">
                    <td className="px-4 py-3 text-slate-400">{log.timestamp}</td>
                    <td className="px-4 py-3 font-bold text-white font-sans">{log.actorName}</td>
                    <td className="px-4 py-3">
                      {log.action === 'PUNCH_EDIT' && (
                        <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-extrabold">
                          EDICIÓN FICHAJE
                        </span>
                      )}
                      {log.action === 'KIOSK_LOCKOUT' && (
                        <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-extrabold">
                          BLOQUEO QUIOSCO
                        </span>
                      )}
                      {log.action === 'EMPLOYEE_UPDATE' && (
                        <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[10px] font-extrabold">
                          EDITAR EMPLEADO
                        </span>
                      )}
                      {log.action === 'SHIFT_CHANGE' && (
                        <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-extrabold">
                          CAMBIO HORARIO
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-emerald-400 font-bold">{log.ipAddress}</td>
                    <td className="px-4 py-3 text-slate-300">{log.targetEntity}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => setSelectedDetailLog(log)}
                        className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-blue-400 hover:text-white transition-colors border border-slate-800 cursor-pointer"
                        title="Ver detalles completos del log"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* CARD 3: SYSTEM SETTINGS FORM */}
      <form onSubmit={handleSave} className="space-y-6">
        <div className="connecteam-glass-card rounded-3xl p-6 border border-slate-800 space-y-4 text-white">
          <div className="flex items-center gap-2.5 border-b border-slate-800 pb-3">
            <Clock className="h-5 w-5 text-blue-400" />
            <h3 className="text-base font-extrabold">Reglas de Horas Extra &amp; Tolerancia</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block text-slate-400 font-bold mb-1">Umbral Diario de Horas Extra (hrs)</label>
              <input
                type="text"
                value={overtimeThreshold}
                onChange={(e) => setOvertimeThreshold(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono font-bold text-center"
              />
            </div>

            <div>
              <label className="block text-slate-400 font-bold mb-1">Tolerancia de Retardo (minutos)</label>
              <input
                type="text"
                value={gracePeriod}
                onChange={(e) => setGracePeriod(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono font-bold text-center"
              />
            </div>

            <div>
              <label className="block text-slate-400 font-bold mb-1">Duración Estándar Descanso (min)</label>
              <input
                type="text"
                value={lunchDuration}
                onChange={(e) => setLunchDuration(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono font-bold text-center"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-black text-xs shadow-xl transition-all active:scale-95 cursor-pointer"
          >
            <Save className="h-4 w-4" /> Guardar Ajustes del Sistema
          </button>
        </div>
      </form>

      {/* AUDIT LOG DETAILS MODAL */}
      {selectedDetailLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-lg connecteam-glass-card rounded-3xl p-6 shadow-2xl border border-slate-700 space-y-4 text-white">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-black flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-400" /> Detalle Completo de Log de Auditoría
              </h3>
              <button onClick={() => setSelectedDetailLog(null)} className="text-slate-400 hover:text-white cursor-pointer">
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs font-sans">
              <div className="grid grid-cols-2 gap-2 bg-slate-950 p-3 rounded-xl border border-slate-800">
                <div>
                  <span className="text-[10px] text-slate-500 font-bold uppercase">Timestamp:</span>
                  <p className="font-mono text-white">{selectedDetailLog.timestamp}</p>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 font-bold uppercase">Dirección IP:</span>
                  <p className="font-mono text-emerald-400">{selectedDetailLog.ipAddress}</p>
                </div>
              </div>

              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
                <span className="text-[10px] text-slate-500 font-bold uppercase">Actor / Usuario Ejecutor:</span>
                <p className="font-bold text-white">{selectedDetailLog.actorName}</p>
                <p className="text-[10px] text-blue-400 font-mono">Rol: {selectedDetailLog.actorRole}</p>
              </div>

              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
                <span className="text-[10px] text-slate-500 font-bold uppercase">Agente del Navegador (User Agent):</span>
                <p className="font-mono text-[11px] text-slate-300 break-all">{selectedDetailLog.userAgent}</p>
              </div>

              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-1">
                <span className="text-[10px] text-amber-400 font-bold uppercase">Detalles de la Acción Realizada:</span>
                <p className="text-slate-200 leading-relaxed font-mono">{selectedDetailLog.details}</p>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedDetailLog(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-white font-bold cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

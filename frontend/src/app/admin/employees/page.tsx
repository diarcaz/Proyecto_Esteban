'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { staffApi } from '@/lib/api-client';
import { MOCK_EMPLOYEES, EmployeeMock } from '@/lib/mock-data';
import { useLocationStore, isLocationMatching } from '@/store/use-location-store';
import { useAuthStore } from '@/store/use-auth-store';
import { Users, Plus, Edit3, Trash2, Globe, AlertTriangle, CheckCircle2, RefreshCw, Loader2 } from 'lucide-react';

export default function EmployeesPage() {
  const { locations, selectedLocationId, fetchLocations } = useLocationStore();
  const { user } = useAuthStore();
  const [employees, setEmployees] = useState<EmployeeMock[]>([]);
  const [loading, setLoading] = useState(true);

  const filteredEmployees = employees.filter((emp) => {
    if (emp.jobPositionCode === 'SUPER_ADMIN' || emp.employeeNumber?.startsWith('ADM-')) {
      return false;
    }
    return isLocationMatching(emp.locationId, emp.locationCode, selectedLocationId);
  });
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Modal States
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingEmp, setEditingEmp] = useState<EmployeeMock | null>(null);
  const [deletingEmp, setDeletingEmp] = useState<EmployeeMock | null>(null);
  const [toastMessage, setToastMessage] = useState<{ msg: string; isError?: boolean } | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    employeeNumber: '',
    jobPositionCode: 'SUPERVISOR',
    locationCode: 'MID-1001',
    locationId: 'loc-mid',
    pinCode: '',
    preferredLanguage: 'es' as 'es' | 'en',
  });

  const showToast = (msg: string, isError = false) => {
    setToastMessage({ msg, isError });
    setTimeout(() => setToastMessage(null), 3500);
  };

  // ── Fetch staff from API (falls back to mock data on error) ──────────────
  const fetchStaff = useCallback(async () => {
    setLoading(true);
    setApiError(null);
    try {
      const data = await staffApi.list();
      if (data && data.length > 0) {
        const mapped: EmployeeMock[] = data.map((item: any) => ({
          id: item.id,
          employeeNumber: item.employeeNumber || 'EMP-000',
          firstName: item.firstName || '',
          lastName: item.lastName || '',
          jobPositionCode: item.jobPositionCode || 'STAFF',
          locationId: item.assignments?.[0]?.locationId || item.locationId || 'loc-mid',
          locationCode: item.assignments?.[0]?.location?.locationCode || item.locationCode || 'MID-1001',
          pinCode: item.pinCode || '',
          preferredLanguage: item.preferredLanguage || 'es',
        }));
        setEmployees(mapped);
      } else {
        // Backend returned empty – seed not applied yet, use mock data
        setEmployees(MOCK_EMPLOYEES);
        setApiError('Using demo data (database is empty — run seed first)');
      }
    } catch {
      // Backend not running or unreachable → gracefully fall back to mock data
      setEmployees(MOCK_EMPLOYEES);
      setApiError('Backend offline — showing demo data (changes persist in-session only)');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStaff();
    fetchLocations();
  }, [fetchStaff, fetchLocations]);

  // Open Add Modal
  const openAddModal = () => {
    const defaultLoc = locations.find((l) => isLocationMatching(l.id, l.code, selectedLocationId)) || locations[0];
    setFormData({
      firstName: '',
      lastName: '',
      employeeNumber: `EMP-${Math.floor(1000 + Math.random() * 9000)}`,
      jobPositionCode: 'SUPERVISOR',
      locationCode: defaultLoc ? defaultLoc.code : 'MID-1001',
      locationId: defaultLoc ? defaultLoc.id : 'loc-mid',
      pinCode: '',
      preferredLanguage: 'es',
    });
    setShowAddModal(true);
  };

  // Open Edit Modal
  const openEditModal = (emp: EmployeeMock) => {
    setEditingEmp(emp);
    setFormData({
      firstName: emp.firstName,
      lastName: emp.lastName,
      employeeNumber: emp.employeeNumber,
      jobPositionCode: emp.jobPositionCode,
      locationCode: emp.locationCode,
      locationId: emp.locationId,
      pinCode: emp.pinCode,
      preferredLanguage: emp.preferredLanguage,
    });
  };

  // ── CREATE staff member ──────────────────────────────────────────────────
  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.firstName || !formData.lastName || formData.pinCode.length !== 6) {
      alert('Please fill out all required fields. PIN code must be exactly 6 digits.');
      return;
    }
    const pinExists = employees.some((e) => e.pinCode === formData.pinCode);
    if (pinExists) {
      alert(`PIN code ${formData.pinCode} is already assigned to another staff member.`);
      return;
    }

    setSaving(true);
    try {
      await staffApi.create({
        firstName: formData.firstName,
        lastName: formData.lastName,
        employeeNumber: formData.employeeNumber,
        jobPositionCode: formData.jobPositionCode,
        locationId: formData.locationId,
        pinCode: formData.pinCode,
        preferredLanguage: formData.preferredLanguage,
      });
      await fetchStaff();
      setShowAddModal(false);
      showToast(`Staff member ${formData.firstName} ${formData.lastName} created and saved to database!`);
    } catch (err: any) {
      // Fallback: update local state
      const created: EmployeeMock = {
        id: `emp-${Date.now()}`,
        employeeNumber: formData.employeeNumber,
        firstName: formData.firstName,
        lastName: formData.lastName,
        jobPositionCode: formData.jobPositionCode,
        locationId: formData.locationId,
        locationCode: formData.locationCode,
        pinCode: formData.pinCode,
        preferredLanguage: formData.preferredLanguage,
      };
      setEmployees((prev) => [...prev, created]);
      setShowAddModal(false);
      showToast(`${formData.firstName} ${formData.lastName} added (demo mode — API: ${err.message})`, true);
    } finally {
      setSaving(false);
    }
  };

  // ── UPDATE staff member ──────────────────────────────────────────────────
  const handleUpdateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmp) return;
    if (!formData.firstName || !formData.lastName || formData.pinCode.length !== 6) {
      alert('Please fill out all required fields. PIN code must be exactly 6 digits.');
      return;
    }
    const pinExists = employees.some((e) => e.id !== editingEmp.id && e.pinCode === formData.pinCode);
    if (pinExists) {
      alert(`PIN code ${formData.pinCode} is already assigned to another staff member.`);
      return;
    }

    setSaving(true);
    try {
      await staffApi.update(editingEmp.id, {
        firstName: formData.firstName,
        lastName: formData.lastName,
        jobPositionCode: formData.jobPositionCode,
        locationId: formData.locationId,
        pinCode: formData.pinCode,
        preferredLanguage: formData.preferredLanguage,
      });
      await fetchStaff();
      setEditingEmp(null);
      showToast(`Staff member ${formData.firstName} ${formData.lastName} updated in database!`);
    } catch (err: any) {
      // Fallback: update local state
      setEmployees((prev) =>
        prev.map((emp) =>
          emp.id === editingEmp.id
            ? { ...emp, ...formData, locationId: formData.locationId }
            : emp
        )
      );
      setEditingEmp(null);
      showToast(`Updated locally (API: ${err.message})`, true);
    } finally {
      setSaving(false);
    }
  };

  // ── DELETE staff member ──────────────────────────────────────────────────
  const handleConfirmDelete = async () => {
    if (!deletingEmp) return;
    const name = `${deletingEmp.firstName} ${deletingEmp.lastName}`;
    setSaving(true);
    try {
      await staffApi.remove(deletingEmp.id);
      await fetchStaff();
      setDeletingEmp(null);
      showToast(`${name} deleted from database (Cascade Delete applied)!`);
    } catch (err: any) {
      // Fallback: update local state
      setEmployees((prev) => prev.filter((emp) => emp.id !== deletingEmp.id));
      setDeletingEmp(null);
      showToast(`Removed locally (API: ${err.message})`, true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Toast Alert */}
      {toastMessage && (
        <div className={`p-4 rounded-2xl text-white flex items-center gap-3 shadow-2xl border text-xs font-bold animate-bounce z-50 ${toastMessage.isError ? 'bg-amber-600/95 border-amber-400' : 'bg-emerald-600/95 border-emerald-400'}`}>
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <span>{toastMessage.msg}</span>
        </div>
      )}

      {/* API Status Banner */}
      {apiError && (
        <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[11px] font-bold">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{apiError}</span>
          <button onClick={fetchStaff} className="ml-auto flex items-center gap-1 text-white bg-amber-600 px-2 py-0.5 rounded-lg cursor-pointer text-[10px]">
            <RefreshCw className="h-3 w-3" /> Retry
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
            Staff Directory &amp; Management <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">NexuStaff Staff</span>
          </h2>
          <p className="text-xs text-slate-400 font-medium">
            Add, edit, and configure staff profiles, assigned branch locations, unique 6-digit PINs, and preferred languages.
          </p>
        </div>
        <button
          onClick={openAddModal}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs shadow-lg transition-all active:scale-95 cursor-pointer"
        >
          <Plus className="h-4 w-4" /> Add New Staff Member
        </button>
      </div>

      {/* Employee Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-xl">
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-3 text-slate-400 text-sm">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading staff from database...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-[10px] font-black uppercase text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3.5">Staff Member</th>
                  <th className="px-4 py-3.5">Emp No</th>
                  <th className="px-4 py-3.5">Position Code (JC_POS)</th>
                  <th className="px-4 py-3.5">Assigned Branch (JC_LOC)</th>
                  <th className="px-4 py-3.5 text-center">Unique 6-Digit PIN</th>
                  <th className="px-4 py-3.5 text-center">Preferred Language</th>
                  <th className="px-4 py-3.5 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {filteredEmployees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3.5 font-bold text-white">
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 text-white font-black flex items-center justify-center text-xs shadow-md">
                          {emp.firstName.charAt(0)}{emp.lastName.charAt(0)}
                        </div>
                        <span>{emp.firstName} {emp.lastName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-slate-400">{emp.employeeNumber}</td>
                    <td className="px-4 py-3.5">
                      <span className="inline-flex items-center rounded-lg bg-blue-500/10 px-2.5 py-1 text-[11px] font-bold text-blue-400 border border-blue-500/20">
                        {emp.jobPositionCode}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 font-semibold text-slate-300">{emp.locationCode || emp.locationId}</td>
                    <td className="px-4 py-3.5 text-center font-mono font-bold text-emerald-400">
                      •••••• ({emp.pinCode})
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-950 text-slate-300 text-[10px] font-bold border border-slate-800">
                        <Globe className="h-3 w-3 text-blue-400" /> {emp.preferredLanguage?.toUpperCase() || 'ES'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button onClick={() => openEditModal(emp)} className="p-1.5 rounded-lg bg-slate-800 hover:bg-blue-600 text-slate-400 hover:text-white transition-colors cursor-pointer" title="Edit Staff Member">
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => setDeletingEmp(emp)} className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-600 text-slate-400 hover:text-white transition-colors cursor-pointer" title="Delete Staff Member">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ADD / EDIT MODAL */}
      {(showAddModal || editingEmp) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          <div className="w-full max-w-md connecteam-glass-card rounded-3xl p-6 shadow-2xl border border-slate-700 space-y-4 text-white">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-black flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-400" /> {editingEmp ? 'Edit Staff Profile' : 'Add New Staff Member'}
              </h3>
              <button onClick={() => { setShowAddModal(false); setEditingEmp(null); }} className="text-slate-400 hover:text-white cursor-pointer">✕</button>
            </div>
            <form onSubmit={editingEmp ? handleUpdateEmployee : handleCreateEmployee} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 font-bold mb-1">First Name</label>
                <input type="text" required placeholder="e.g. Esteban" value={formData.firstName} onChange={(e) => setFormData({ ...formData, firstName: e.target.value })} className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white" />
              </div>
              <div>
                <label className="block text-slate-400 font-bold mb-1">Last Name</label>
                <input type="text" required placeholder="e.g. Gomez" value={formData.lastName} onChange={(e) => setFormData({ ...formData, lastName: e.target.value })} className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 font-bold mb-1">Position Code</label>
                  <select value={formData.jobPositionCode} onChange={(e) => setFormData({ ...formData, jobPositionCode: e.target.value })} className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white">
                    <option value="SUPERVISOR">SUPERVISOR</option>
                    <option value="RECEPT">RECEPT</option>
                    <option value="IT_SPEC">IT_SPEC</option>
                    <option value="OP_MNT">OP_MNT</option>
                    <option value="CAJERO">CAJERO</option>
                    <option value="LOGISTICA">LOGISTICA</option>
                    <option value="EVENTOS">EVENTOS</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 font-bold mb-1">Assigned Branch</label>
                  <select
                    value={formData.locationId}
                    onChange={(e) => {
                      const locId = e.target.value;
                      const selectedLoc = locations.find((l) => l.id === locId);
                      setFormData({
                        ...formData,
                        locationId: locId,
                        locationCode: selectedLoc ? selectedLoc.code : 'MID-1001',
                      });
                    }}
                    className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold"
                  >
                    {(user?.role === 'LOCATION_ADMIN'
                      ? locations.filter((loc) => isLocationMatching(loc.id, loc.code, selectedLocationId))
                      : locations
                    ).map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        [{loc.code}] {loc.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 font-bold mb-1">Unique 6-Digit PIN</label>
                  <input type="text" required maxLength={6} placeholder="100100" value={formData.pinCode} onChange={(e) => setFormData({ ...formData, pinCode: e.target.value })} className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-center font-bold" />
                </div>
                <div>
                  <label className="block text-slate-400 font-bold mb-1">Preferred Language</label>
                  <select value={formData.preferredLanguage} onChange={(e) => setFormData({ ...formData, preferredLanguage: e.target.value as 'es' | 'en' })} className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold">
                    <option value="es">Español (ES)</option>
                    <option value="en">English (EN)</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button type="button" onClick={() => { setShowAddModal(false); setEditingEmp(null); }} className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-bold cursor-pointer">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black cursor-pointer flex items-center gap-2 disabled:opacity-60">
                  {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {editingEmp ? 'Update Staff Member' : 'Save Staff Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MANDATORY DELETE CONFIRMATION MODAL */}
      {deletingEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-md connecteam-glass-card rounded-3xl p-6 shadow-2xl border-2 border-rose-500/50 space-y-5 text-white">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="h-12 w-12 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center">
                <AlertTriangle className="h-7 w-7" />
              </div>
              <div>
                <h3 className="text-lg font-black tracking-tight text-white">Confirm Staff Deletion</h3>
                <p className="text-xs text-rose-300 font-semibold">Irreversible Administrative Action</p>
              </div>
            </div>
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-xs space-y-2">
              <p className="text-slate-300">
                Are you sure you want to remove <strong className="text-white font-black">{deletingEmp.firstName} {deletingEmp.lastName}</strong> ({deletingEmp.employeeNumber}) from the system?
              </p>
              <p className="text-[11px] text-slate-400">
                This action will delete staff credentials and unassign associated shift logs via database Cascade Delete. This action cannot be undone.
              </p>
            </div>
            <div className="flex justify-end gap-3 pt-1">
              <button onClick={() => setDeletingEmp(null)} className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-extrabold text-xs cursor-pointer">Cancel</button>
              <button onClick={handleConfirmDelete} disabled={saving} className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs shadow-lg transition-all active:scale-95 cursor-pointer flex items-center gap-2 disabled:opacity-60">
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Yes, Delete Staff Member
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

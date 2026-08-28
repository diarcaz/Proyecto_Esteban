'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { locationsApi } from '@/lib/api-client';
import { MOCK_LOCATIONS, LocationMock } from '@/lib/mock-data';
import { useLocationStore } from '@/store/use-location-store';
import { useAuthStore } from '@/store/use-auth-store';
import Link from 'next/link';
import { MapPin, Plus, Tablet, Building2, Edit3, ShieldCheck, Trash2, AlertTriangle, CheckCircle2, Loader2, RefreshCw, ShieldAlert } from 'lucide-react';

export default function LocationsPage() {
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN' && user?.email === 'admin@nexustaff.com';

  const [locations, setLocations] = useState<LocationMock[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingLoc, setEditingLoc] = useState<LocationMock | null>(null);
  const [deletingLoc, setDeletingLoc] = useState<LocationMock | null>(null);
  const [toastMessage, setToastMessage] = useState<{ msg: string; isError?: boolean } | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    code: '',
    address: '',
    city: '',
    kioskCode: '',
  });

  const showToast = (msg: string, isError = false) => {
    setToastMessage({ msg, isError });
    setTimeout(() => setToastMessage(null), 3500);
  };

  // ── Fetch locations from API (falls back to mock data on error) ───────────
  const fetchLocations = useCallback(async () => {
    setLoading(true);
    setApiError(null);
    try {
      const data = await locationsApi.list();
      if (data && data.length > 0) {
        const mapped: LocationMock[] = data.map((loc: any) => ({
          id: loc.id,
          name: loc.name,
          code: loc.locationCode || loc.code || 'LOC-100',
          address: loc.address || '',
          city: loc.city || loc.address || '',
          activeStaffCount: loc._count?.assignments || loc.assignments?.length || 0,
          kioskCode: loc.locationCode?.split('-')[1] || '1001',
        }));
        setLocations(mapped);
      } else {
        setLocations(MOCK_LOCATIONS);
        setApiError('Using demo data (database is empty — run seed first)');
      }
    } catch {
      setLocations(MOCK_LOCATIONS);
      setApiError('Backend offline — showing demo data (changes persist in-session only)');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8 space-y-4 font-sans">
        <div className="h-16 w-16 rounded-3xl bg-rose-500/10 text-rose-400 flex items-center justify-center border border-rose-500/20 shadow-xl">
          <ShieldAlert className="h-8 w-8" />
        </div>
        <h2 className="text-xl font-black text-white">Acceso Restringido - Exclusivo SuperAdmin</h2>
        <p className="text-xs text-slate-400 max-w-md">
          El módulo de Gestión Global de Sucursales sólo está disponible para Administradores Generales. Los Administradores de Sucursal sólo operan sobre su sede asignada.
        </p>
        <Link href="/admin" className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white transition-all shadow-md">
          Volver al Panel Principal
        </Link>
      </div>
    );
  }

  const openAddModal = () => {
    setFormData({
      name: '',
      code: `LOC-${Math.floor(1000 + Math.random() * 9000)}`,
      address: '',
      city: '',
      kioskCode: `${Math.floor(1000 + Math.random() * 9000)}`,
    });
    setShowAddModal(true);
  };

  const openEditModal = (loc: LocationMock) => {
    setEditingLoc(loc);
    setFormData({ name: loc.name, code: loc.code, address: loc.address, city: loc.city, kioskCode: loc.kioskCode });
  };

  // ── CREATE location ──────────────────────────────────────────────────────
  const handleCreateLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.address) {
      alert('Please fill out all required location details.');
      return;
    }
    setSaving(true);
    try {
      await locationsApi.create({
        name: formData.name,
        code: formData.code,
        address: formData.address,
        city: formData.city || 'Mexico',
        kioskCode: formData.kioskCode,
      });
      await fetchLocations();
      useLocationStore.getState().fetchLocations();
      setShowAddModal(false);
      showToast(`Branch location "${formData.name}" created and saved to database!`);
    } catch (err: any) {
      const created: LocationMock = {
        id: `loc-${Date.now()}`,
        name: formData.name, code: formData.code, address: formData.address,
        city: formData.city || 'Mexico', activeStaffCount: 0, kioskCode: formData.kioskCode,
      };
      setLocations((prev) => [...prev, created]);
      useLocationStore.setState((state) => ({ locations: [...state.locations, created] }));
      setShowAddModal(false);
      showToast(`Location added locally (API: ${err.message})`, true);
    } finally {
      setSaving(false);
    }
  };

  // ── UPDATE location ──────────────────────────────────────────────────────
  const handleUpdateLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLoc) return;
    setSaving(true);
    try {
      await locationsApi.update(editingLoc.id, {
        name: formData.name, address: formData.address, city: formData.city,
      });
      await fetchLocations();
      useLocationStore.getState().fetchLocations();
      setEditingLoc(null);
      showToast(`Branch "${formData.name}" updated in database!`);
    } catch (err: any) {
      setLocations((prev) =>
        prev.map((l) => l.id === editingLoc.id ? { ...l, ...formData } : l)
      );
      useLocationStore.getState().fetchLocations();
      setEditingLoc(null);
      showToast(`Updated locally (API: ${err.message})`, true);
    } finally {
      setSaving(false);
    }
  };

  // ── DELETE location ──────────────────────────────────────────────────────
  const handleConfirmDelete = async () => {
    if (!deletingLoc) return;
    setSaving(true);
    try {
      await locationsApi.remove(deletingLoc.id);
      await fetchLocations();
      useLocationStore.getState().fetchLocations();
      setDeletingLoc(null);
      showToast(`Branch "${deletingLoc.name}" deleted from database!`);
    } catch (err: any) {
      setLocations((prev) => prev.filter((l) => l.id !== deletingLoc.id));
      setDeletingLoc(null);
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
          <CheckCircle2 className="h-5 w-5 shrink-0" /><span>{toastMessage.msg}</span>
        </div>
      )}

      {apiError && (
        <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[11px] font-bold">
          <AlertTriangle className="h-4 w-4 shrink-0" /><span>{apiError}</span>
          <button onClick={fetchLocations} className="ml-auto flex items-center gap-1 text-white bg-amber-600 px-2 py-0.5 rounded-lg cursor-pointer text-[10px]">
            <RefreshCw className="h-3 w-3" /> Retry
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
            Branch Locations &amp; Kiosks <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">NexuStaff Branches</span>
          </h2>
          <p className="text-xs text-slate-400 font-medium">Manage agency branch locations, addresses, timezone settings, and unique kiosk device codes.</p>
        </div>
        <button onClick={openAddModal} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs shadow-lg transition-all active:scale-95 cursor-pointer">
          <Plus className="h-4 w-4" /> Add New Branch Location
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 gap-3 text-slate-400 text-sm">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading locations from database...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {locations.map((loc) => (
            <div key={loc.id} className="connecteam-glass-card rounded-2xl p-5 border border-slate-800 space-y-4 relative">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-blue-600/20 text-blue-400 font-bold flex items-center justify-center border border-blue-500/30">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold text-white">{loc.name}</h3>
                    <p className="text-xs text-slate-400">{loc.address} &bull; {loc.city}</p>
                  </div>
                </div>
                <span className="font-mono text-xs font-bold bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800 text-emerald-400">[{loc.code}]</span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1">
                  <span className="text-[10px] text-slate-500 font-bold uppercase">Active Staff On-Site</span>
                  <p className="text-lg font-black text-white">{loc.activeStaffCount} Staff Members</p>
                </div>
                <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1">
                  <span className="text-[10px] text-slate-500 font-bold uppercase flex items-center gap-1">
                    <Tablet className="h-3.5 w-3.5 text-blue-400" /> Kiosk Device Code
                  </span>
                  <p className="text-sm font-black font-mono text-blue-400">{loc.kioskCode}</p>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-slate-800 pt-3 text-xs">
                <span className="text-emerald-400 text-[10px] font-bold uppercase flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5" /> Status: Active &amp; Synced
                </span>
                <div className="flex items-center gap-2">
                  <button onClick={() => openEditModal(loc)} className="flex items-center gap-1 text-slate-400 hover:text-white font-bold cursor-pointer">
                    <Edit3 className="h-3.5 w-3.5" /> Edit
                  </button>
                  <button onClick={() => setDeletingLoc(loc)} className="flex items-center gap-1 text-slate-400 hover:text-rose-400 font-bold cursor-pointer">
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ADD / EDIT LOCATION MODAL */}
      {(showAddModal || editingLoc) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          <div className="w-full max-w-md connecteam-glass-card rounded-3xl p-6 shadow-2xl border border-slate-700 space-y-4 text-white">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-black flex items-center gap-2">
                <Building2 className="h-5 w-5 text-blue-400" /> {editingLoc ? 'Edit Branch Location' : 'Add New Branch Location'}
              </h3>
              <button onClick={() => { setShowAddModal(false); setEditingLoc(null); }} className="text-slate-400 hover:text-white cursor-pointer">✕</button>
            </div>
            <form onSubmit={editingLoc ? handleUpdateLocation : handleCreateLocation} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 font-bold mb-1">Branch Name</label>
                <input type="text" required placeholder="e.g. Sucursal Centro - MÉRIDA" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white" />
              </div>
              <div>
                <label className="block text-slate-400 font-bold mb-1">Address</label>
                <input type="text" required placeholder="e.g. Calle 60 #450 x 53" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 font-bold mb-1">City / State</label>
                  <input type="text" required placeholder="e.g. Mérida, Yucatán" value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white" />
                </div>
                <div>
                  <label className="block text-slate-400 font-bold mb-1">Kiosk Pairing Code</label>
                  <input type="text" required placeholder="1001" value={formData.kioskCode} onChange={(e) => setFormData({ ...formData, kioskCode: e.target.value })} className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono font-bold text-center" />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button type="button" onClick={() => { setShowAddModal(false); setEditingLoc(null); }} className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-bold cursor-pointer">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black cursor-pointer flex items-center gap-2 disabled:opacity-60">
                  {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {editingLoc ? 'Update Location' : 'Save Branch Location'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deletingLoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-md connecteam-glass-card rounded-3xl p-6 shadow-2xl border-2 border-rose-500/50 space-y-5 text-white">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="h-12 w-12 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center">
                <AlertTriangle className="h-7 w-7" />
              </div>
              <div>
                <h3 className="text-lg font-black tracking-tight text-white">Confirm Location Deletion</h3>
                <p className="text-xs text-rose-300 font-semibold">This will also delete all associated attendance logs.</p>
              </div>
            </div>
            <p className="text-xs text-slate-300 p-4 rounded-2xl bg-slate-950 border border-slate-800">
              Are you sure you want to delete <strong className="text-white">{deletingLoc.name}</strong>? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3 pt-1">
              <button onClick={() => setDeletingLoc(null)} className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 font-extrabold text-xs cursor-pointer">Cancel</button>
              <button onClick={handleConfirmDelete} disabled={saving} className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs flex items-center gap-2 disabled:opacity-60 cursor-pointer">
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Yes, Delete Location
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

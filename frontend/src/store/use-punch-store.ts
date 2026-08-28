import { create } from 'zustand';
import { PunchMock } from '@/lib/mock-data';
import { attendanceApi } from '@/lib/api-client';

export interface PunchStoreState {
  punches: PunchMock[];
  isLoading: boolean;
  searchQuery: string;
  selectedPosition: string;
  activeFilterTab: 'ALL' | 'ON_SHIFT' | 'LATE' | 'OVERTIME';
  setSearchQuery: (query: string) => void;
  setSelectedPosition: (position: string) => void;
  setActiveFilterTab: (tab: 'ALL' | 'ON_SHIFT' | 'LATE' | 'OVERTIME') => void;
  fetchPunches: (locationId?: string) => Promise<void>;
  addPunch: (punch: PunchMock) => void;
  updatePunchTime: (id: string, actualIn: string, actualOut?: string) => Promise<void>;
  approveOvertime: (id: string) => Promise<void>;
  clearPunches: () => void;
}

const getStoredLivePunches = (): PunchMock[] => {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem('nexustaff_live_punches');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
  }
  return [];
};

const saveStoredLivePunches = (punches: PunchMock[]) => {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('nexustaff_live_punches', JSON.stringify(punches));
    } catch (e) {}
  }
};

export const usePunchStore = create<PunchStoreState>((set, get) => ({
  punches: getStoredLivePunches(),
  isLoading: false,
  searchQuery: '',
  selectedPosition: 'ALL',
  activeFilterTab: 'ALL',

  setSearchQuery: (query) => set({ searchQuery: query }),
  setSelectedPosition: (position) => set({ selectedPosition: position }),
  setActiveFilterTab: (tab) => set({ activeFilterTab: tab }),

  fetchPunches: async (locationId) => {
    set({ isLoading: true });
    const localPunches = getStoredLivePunches();
    try {
      const params: Record<string, string> = {};
      if (locationId && locationId !== 'ALL') params.location_id = locationId;
      const data = await attendanceApi.list(params).catch(() => []);
      if (Array.isArray(data) && data.length > 0) {
        const mapped: PunchMock[] = data.map((item: any) => ({
          id: item.id,
          userId: item.userId || item.user?.id || '',
          employeeNumber: item.user?.employeeNumber || item.employeeNumber || 'EMP-000',
          employeeName: `${item.user?.firstName || ''} ${item.user?.lastName || ''}`.trim() || 'Empleado',
          jobPositionCode: item.user?.jobPositionCode || 'STAFF',
          locationId: item.locationId || item.location?.id || '',
          locationCode: item.location?.locationCode || 'LOC-100',
          scheduledIn: item.shiftSchedule?.scheduledIn ? new Date(item.shiftSchedule.scheduledIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '08:00 AM',
          scheduledOut: item.shiftSchedule?.scheduledOut ? new Date(item.shiftSchedule.scheduledOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '04:30 PM',
          actualIn: item.timestamp ? new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined,
          actualOut: item.actualTimestamp && item.type === 'CLOCK_OUT' ? new Date(item.actualTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined,
          takenLunch: item.takenLunch ?? false,
          calculatedHours: item.calculatedHours ? Number(item.calculatedHours) : undefined,
          isOvertime: item.isOvertime ?? false,
          isOvertimeApproved: item.isOvertimeApproved ?? false,
          status: item.status || (item.isOvertime ? 'OVERTIME' : 'ON_TIME'),
        }));

        // Merge local punches with API punches without duplicate IDs
        const existingIds = new Set(mapped.map((p) => p.id));
        const uniqueLocal = localPunches.filter((p) => !existingIds.has(p.id));
        const merged = [...uniqueLocal, ...mapped];
        set({ punches: merged, isLoading: false });
        return;
      }
    } catch (e) {
      console.warn('Could not fetch punches from backend API:', e);
    }
    set({ punches: localPunches, isLoading: false });
  },

  addPunch: (punch) => {
    set((state) => {
      const updated = [punch, ...state.punches.filter((p) => p.id !== punch.id)];
      saveStoredLivePunches(updated);
      return { punches: updated };
    });
  },

  updatePunchTime: async (id, actualIn, actualOut) => {
    try {
      await attendanceApi.adjustPunch(id, { actualIn, actualOut });
    } catch (e) {
      console.warn('Error syncing punch adjustment with API:', e);
    }
    set((state) => {
      const updated = state.punches.map((p) => {
        if (p.id === id) {
          return {
            ...p,
            actualIn: actualIn || p.actualIn,
            actualOut: actualOut,
          };
        }
        return p;
      });
      saveStoredLivePunches(updated);
      return { punches: updated };
    });
  },

  approveOvertime: async (id) => {
    try {
      await attendanceApi.approveOvertime(id);
    } catch (e) {
      console.warn('Error approving overtime with API:', e);
    }
    set((state) => {
      const updated = state.punches.map((p) => {
        if (p.id === id) {
          return {
            ...p,
            status: 'OVERTIME' as const,
            isOvertime: true,
            isOvertimeApproved: true,
          };
        }
        return p;
      });
      saveStoredLivePunches(updated);
      return { punches: updated };
    });
  },

  clearPunches: () => {
    saveStoredLivePunches([]);
    set({ punches: [] });
  },
}));

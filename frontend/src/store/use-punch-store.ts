import { create } from 'zustand';
import { attendanceApi } from '@/lib/api-client';
import type { AttendancePunch } from '@/types/attendance';

export interface PunchStoreState {
  punches: AttendancePunch[];
  isLoading: boolean;
  searchQuery: string;
  selectedPosition: string;
  activeFilterTab: 'ALL' | 'ON_SHIFT' | 'LATE' | 'OVERTIME';
  setSearchQuery: (query: string) => void;
  setSelectedPosition: (position: string) => void;
  setActiveFilterTab: (tab: 'ALL' | 'ON_SHIFT' | 'LATE' | 'OVERTIME') => void;
  fetchPunches: (locationId?: string) => Promise<void>;
  addPunch: (punch: AttendancePunch) => void;
  updatePunchTime: (id: string, actualIn: string, actualOut?: string) => Promise<void>;
  approveOvertime: (id: string) => Promise<void>;
  clearPunches: () => void;
}

export const usePunchStore = create<PunchStoreState>((set, get) => ({
  punches: [],
  isLoading: false,
  searchQuery: '',
  selectedPosition: 'ALL',
  activeFilterTab: 'ALL',

  setSearchQuery: (query) => set({ searchQuery: query }),
  setSelectedPosition: (position) => set({ selectedPosition: position }),
  setActiveFilterTab: (tab) => set({ activeFilterTab: tab }),

  fetchPunches: async (locationId) => {
    set({ isLoading: true });
    try {
      const params: Record<string, string> = {};
      if (locationId && locationId !== 'ALL') params.location_id = locationId;
      const data = await attendanceApi.list(params).catch(() => []);
      if (Array.isArray(data) && data.length > 0) {
        const mapped: AttendancePunch[] = data.map((item: any) => ({
          id: item.id,
          userId: item.userId || item.user?.id || '',
          employeeNumber: item.user?.employeeNumber || item.employeeNumber || '',
          employeeName: `${item.user?.firstName || ''} ${item.user?.lastName || ''}`.trim(),
          jobPositionCode: item.user?.jobPositionCode || '',
          locationId: item.locationId || item.location?.id || '',
          locationCode: item.location?.locationCode || item.location?.code || '',
          scheduledIn: item.shiftSchedule?.scheduledIn ? new Date(item.shiftSchedule.scheduledIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined,
          scheduledOut: item.shiftSchedule?.scheduledOut ? new Date(item.shiftSchedule.scheduledOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined,
          actualIn: item.timestamp ? new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined,
          actualOut: item.actualTimestamp && item.type === 'CLOCK_OUT' ? new Date(item.actualTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined,
          takenLunch: item.takenLunch ?? false,
          calculatedHours: item.calculatedHours ? Number(item.calculatedHours) : undefined,
          isOvertime: item.isOvertime ?? false,
          isOvertimeApproved: item.isOvertimeApproved ?? false,
          status: item.status || 'UNKNOWN',
        }));
        set({ punches: mapped, isLoading: false });
        return;
      }
    } catch (e) {
      console.warn('Could not fetch punches from backend API:', e);
    }
    set({ punches: [], isLoading: false });
  },

  addPunch: (punch) => {
    set((state) => {
      const updated = [punch, ...state.punches.filter((p) => p.id !== punch.id)];
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
      return { punches: updated };
    });
  },

  clearPunches: () => {
    set({ punches: [] });
  },
}));

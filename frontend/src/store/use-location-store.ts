import { create } from 'zustand';
import type { LocationMock } from '@/lib/mock-data';
import { locationsApi } from '@/lib/api-client';

interface LocationState {
  locations: LocationMock[];
  isLoading: boolean;
  selectedLocationId: string;
  setSelectedLocationId: (id: string) => void;
  fetchLocations: () => Promise<void>;
  getSelectedLocation: () => LocationMock | undefined;
}

export function isLocationMatching(itemLocId?: string, itemLocCode?: string, targetSelectedId?: string): boolean {
  if (!targetSelectedId || targetSelectedId === 'ALL') return true;
  if (!itemLocId && !itemLocCode) return false;

  // Direct match on ID or Code
  if (itemLocId === targetSelectedId || itemLocCode === targetSelectedId) return true;

  // Lookup target location object in store
  const locations = useLocationStore.getState().locations;
  const targetLoc = locations.find(
    (l) => l.id === targetSelectedId || l.code === targetSelectedId
  );

  if (targetLoc) {
    if (itemLocId && itemLocId === targetLoc.id) return true;
    if (itemLocCode && itemLocCode === targetLoc.code) return true;

  }
  return false;
}

export const useLocationStore = create<LocationState>((set, get) => ({
  locations: [],
  isLoading: false,
  selectedLocationId: 'ALL',
  setSelectedLocationId: (id: string) => set({ selectedLocationId: id }),
  fetchLocations: async () => {
    set({ isLoading: true, locations: [] });
    try {
      const data = await locationsApi.list();
      if (Array.isArray(data) && data.length > 0) {
        const mapped: LocationMock[] = data.map((loc: any) => ({
          id: loc.id,
          name: loc.name,
          code: loc.code,
          address: loc.address || '',
          city: loc.city || loc.address || '',
          activeStaffCount: loc.activeStaffCount ?? loc._count?.assignments ?? loc.assignments?.length ?? 0,
          kioskCode: loc.kioskCode,
        }));
        set({ locations: mapped, isLoading: false });
        return;
      }
    } catch (e) {
      console.warn('Could not fetch authorized properties.');
    }
    set({ isLoading: false });
  },
  getSelectedLocation: () => {
    const { locations, selectedLocationId } = get();
    return locations.find((l) => l.id === selectedLocationId || l.code === selectedLocationId);
  },
}));

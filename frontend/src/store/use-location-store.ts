import { create } from 'zustand';
import { MOCK_LOCATIONS, LocationMock } from '@/lib/mock-data';
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

    // Dynamic prefix match for any new branch (e.g. MID-1001 vs MID, PUE-1004 vs PUE)
    const targetPrefix = targetLoc.code.split('-')[0].toUpperCase();
    const itemPrefix = (itemLocCode || '').split('-')[0].toUpperCase();
    if (targetPrefix && itemPrefix && targetPrefix === itemPrefix) return true;
  }

  // Fallback slug matching
  const targetUpper = targetSelectedId.toUpperCase();
  const currentCodeUpper = (itemLocCode || '').toUpperCase();
  const currentIdLower = (itemLocId || '').toLowerCase();

  if (targetUpper.includes('MID') || targetSelectedId === 'loc-mid') {
    return currentCodeUpper.includes('MID') || currentIdLower.includes('mid');
  }
  if (targetUpper.includes('CUN') || targetSelectedId === 'loc-cun') {
    return currentCodeUpper.includes('CUN') || currentIdLower.includes('cun');
  }
  if (targetUpper.includes('MTY') || targetSelectedId === 'loc-mty') {
    return currentCodeUpper.includes('MTY') || currentIdLower.includes('mty');
  }

  return false;
}

export const useLocationStore = create<LocationState>((set, get) => ({
  locations: MOCK_LOCATIONS,
  isLoading: false,
  selectedLocationId: 'ALL',
  setSelectedLocationId: (id: string) => set({ selectedLocationId: id }),
  fetchLocations: async () => {
    set({ isLoading: true });
    try {
      const data = await locationsApi.list();
      if (Array.isArray(data) && data.length > 0) {
        const mapped: LocationMock[] = data.map((loc: any) => ({
          id: loc.id,
          name: loc.name,
          code: loc.locationCode || loc.code || 'LOC-001',
          address: loc.address || '',
          city: loc.city || loc.address || '',
          activeStaffCount: loc._count?.assignments || loc.assignments?.length || 0,
          kioskCode: loc.locationCode?.split('-')[1] || '1001',
        }));
        set({ locations: mapped, isLoading: false });
        return;
      }
    } catch (e) {
      console.warn('Could not fetch locations from backend API, using fallback store:', e);
    }
    set({ isLoading: false });
  },
  getSelectedLocation: () => {
    const { locations, selectedLocationId } = get();
    return locations.find((l) => l.id === selectedLocationId || l.code === selectedLocationId);
  },
}));

// IndexedDB Offline Punch Manager for NexuStaff Kiosk

const DB_NAME = 'nexustaff_kiosk_offline_db';
const DB_VERSION = 1;
const STORE_NAME = 'offline_punches';

export interface OfflinePunch {
  id: string;
  employee_number: string;
  pin_code: string;
  location_code: string;
  type: 'CLOCK_IN' | 'LUNCH_START' | 'LUNCH_END' | 'CLOCK_OUT';
  timestamp: string;
  photoUrl?: string;
  device_info?: any;
  synced: boolean;
  createdAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported'));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: any) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('synced', 'synced', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };

    request.onsuccess = (event: any) => resolve(event.target.result);
    request.onerror = (event: any) => reject(event.target.error);
  });
}

export async function saveOfflinePunch(punch: Omit<OfflinePunch, 'id' | 'synced' | 'createdAt'>): Promise<OfflinePunch> {
  const db = await openDB();
  const newPunch: OfflinePunch = {
    ...punch,
    id: `offline-punch-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    synced: false,
    createdAt: Date.now(),
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.add(newPunch);

    req.onsuccess = () => resolve(newPunch);
    req.onerror = () => reject(req.error);
  });
}

export async function getPendingOfflinePunches(): Promise<OfflinePunch[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => {
        const results: OfflinePunch[] = req.result || [];
        resolve(results.filter((p) => !p.synced));
      };
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    return [];
  }
}

export async function removeOfflinePunch(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);

    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function syncOfflinePunches(apiPunchFn: (punchData: any) => Promise<any>): Promise<{ syncedCount: number; errors: number }> {
  const pending = await getPendingOfflinePunches();
  if (pending.length === 0) return { syncedCount: 0, errors: 0 };

  let syncedCount = 0;
  let errors = 0;

  for (const punch of pending) {
    try {
      await apiPunchFn({
        employee_number: punch.employee_number,
        pin_code: punch.pin_code,
        location_code: punch.location_code,
        type: punch.type,
        photo_url: punch.photoUrl,
        device_info: punch.device_info,
      });
      await removeOfflinePunch(punch.id);
      syncedCount++;
    } catch (err) {
      console.warn(`[Offline Sync Failed for punch ${punch.id}]`, err);
      // Remove stale test punches that are older than 1 hour or unprocessable
      if (Date.now() - punch.createdAt > 3600000) {
        await removeOfflinePunch(punch.id);
      }
      errors++;
    }
  }

  return { syncedCount, errors };
}

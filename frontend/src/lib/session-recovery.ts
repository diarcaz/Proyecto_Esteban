import { clearAuthStorage } from './admin-access';

export const SESSION_EXPIRED_MESSAGE = 'Your session expired. Please sign in again.';
let recovering = false;
let clearState = () => {};

export function registerSessionCleanup(cleanup: () => void) { clearState = cleanup; }
export function resetSessionRecovery() { recovering = false; }

export function recoverExpiredSession(requestToken: string | null) {
  if (typeof window === 'undefined' || recovering) return;
  // A late 401 from a previous login must not invalidate a newer session.
  try { if (window.localStorage.getItem('nexustaff_token') !== requestToken) return; } catch { /* Still clear in-memory state. */ }
  recovering = true;
  clearState();
  try { clearAuthStorage(window.localStorage); } catch { /* Storage may be unavailable. */ }
  if (window.location.pathname.startsWith('/admin') || window.location.pathname === '/clock/setup') {
    if (window.location.pathname !== '/admin/login') window.location.replace('/admin/login?session=expired');
  }
}

export function isPublicApiPath(path: string) {
  return ['/auth/login', '/auth/refresh', '/attendance/kiosk-identify', '/attendance/kiosk-status', '/attendance/kiosk-clock'].includes(path.split('?')[0]);
}

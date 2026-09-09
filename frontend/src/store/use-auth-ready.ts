'use client';
import { useSyncExternalStore } from 'react';
import { useAuthStore } from './use-auth-store';

// React uses the server snapshot during SSR and the first hydration render.
export const authServerSnapshot = () => false;
export const authClientSnapshot = () => useAuthStore.persist.hasHydrated();
function subscribe(callback: () => void) {
  const start = useAuthStore.persist.onHydrate(callback);
  const finish = useAuthStore.persist.onFinishHydration(callback);
  return () => { start(); finish(); };
}
export function useAuthReady() {
  return useSyncExternalStore(subscribe, authClientSnapshot, authServerSnapshot);
}

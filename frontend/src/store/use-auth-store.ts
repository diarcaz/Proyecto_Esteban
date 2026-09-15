import { AdminIdentity, isAdminRole, clearAuthStorage } from '@/lib/admin-access';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { authApi } from '@/lib/api-client';
import { registerSessionCleanup, resetSessionRecovery } from '@/lib/session-recovery';

export interface AdminUser extends AdminIdentity {
  id: string;
  email: string;
  name: string;
  assignedLocationIds?: string[];
}

interface AuthState {
  isAuthenticated: boolean;
  user: AdminUser | null;
  token: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  setUser: (user: AdminUser) => void;
}

const getInitialState = () => {
  if (typeof window !== 'undefined') {
    try {
      const rawUser = localStorage.getItem('nexustaff_user');
      const rawToken = localStorage.getItem('nexustaff_token');
      if (rawUser && rawToken) {
        const user = JSON.parse(rawUser);
        if (isAdminRole(user?.role)) return { isAuthenticated: true, user, token: rawToken };
      }
      const rawStore = localStorage.getItem('nexustaff-auth-store');
      if (rawStore) {
        const parsed = JSON.parse(rawStore);
        if (parsed?.state?.isAuthenticated && isAdminRole(parsed?.state?.user?.role) && parsed?.state?.token) {
          return {
            isAuthenticated: true,
            user: parsed.state.user,
            token: parsed.state.token,
          };
        }
      }
    } catch (e) {}
  }
  return { isAuthenticated: false, user: null, token: null };
};

const initState = getInitialState();

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      isAuthenticated: initState.isAuthenticated,
      user: initState.user,
      token: initState.token,

      setUser: (user: AdminUser) => {
        if (!isAdminRole(user?.role)) return;
        if (typeof window !== 'undefined') {
          localStorage.setItem('nexustaff_user', JSON.stringify(user));
        }
        set({ user, isAuthenticated: true });
      },

      login: async (email: string, password: string) => {
        try {
          const res = await authApi.login({ email, password });
          if (res?.tokens?.accessToken) {
            if (!isAdminRole(res.user?.role)) {
              console.warn('Worker access denied to administrative portal');
              return false;
            }
            const userObj: AdminUser = {
              id: res.user.id,
              email: res.user.email,
              name: `${res.user.firstName || ''} ${res.user.lastName || ''}`.trim() || email,
              role: res.user.role,
              companyId: res.user.companyId,
              permissions: res.user.permissions || [],
              propertyAccess: res.user.propertyAccess || [],
              assignedLocationIds: res.user.assignedLocationIds || [],
            };
            if (typeof window !== 'undefined') {
              localStorage.setItem('nexustaff_token', res.tokens.accessToken);
              localStorage.setItem('nexustaff_user', JSON.stringify(userObj));
            }
            resetSessionRecovery();
            set({
              isAuthenticated: true,
              user: userObj,
              token: res.tokens.accessToken,
            });
            return true;
          }
        } catch (err) {
          console.error('Backend API auth error:', err);
          return false;
        }
        return false;
      },

      logout: () => {
        authApi.logout().catch(() => {});
        if (typeof window !== 'undefined') {
          clearAuthStorage(localStorage);
        }
        set({
          isAuthenticated: false,
          user: null,
          token: null,
        });
      },
    }),
    {
      name: 'nexustaff-auth-store',
      merge: (persisted: any, current) => persisted?.token && isAdminRole(persisted?.user?.role)
        ? { ...current, ...persisted } : { ...current, isAuthenticated: false, user: null, token: null },
      storage: createJSONStorage(() => (typeof window !== 'undefined' ? localStorage : ({} as any))),
    }
  )
);

registerSessionCleanup(() => useAuthStore.setState({ isAuthenticated: false, user: null, token: null }));

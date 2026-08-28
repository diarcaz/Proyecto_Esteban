/**
 * Centralized API client for Admin Portal → NestJS Backend communication.
 * Backend runs on port 3001. Frontend on port 3000.
 */

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

function getAuthHeader(): Record<string, string> {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('nexustaff_token');
    if (token) {
      return { Authorization: `Bearer ${token}` };
    }
  }
  return {};
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = {
    'Content-Type': 'application/json',
    ...getAuthHeader(),
    ...(options?.headers || {}),
  };

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let errMsg = `Request failed: ${res.status} ${res.statusText}`;
    try {
      const data = await res.json();
      errMsg = data?.message || errMsg;
    } catch (_) {}
    throw new Error(errMsg);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;
  return res.json();
}

/* ─── Auth ───────────────────────────────────────────────────────────────── */
export const authApi = {
  login: (data: { email: string; password: string }) => request<any>('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  logout: () => request<any>('/auth/logout', { method: 'POST' }),
};

/* ─── Staff ─────────────────────────────────────────────────────────────── */
export const staffApi = {
  list: () => request<any[]>('/staff'),
  create: (data: any) => request<any>('/staff', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) => request<any>(`/staff/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  remove: (id: string) => request<any>(`/staff/${id}`, { method: 'DELETE' }),
};

/* ─── Locations ──────────────────────────────────────────────────────────── */
export const locationsApi = {
  list: () => request<any[]>('/locations'),
  create: (data: any) => request<any>('/locations', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) => request<any>(`/locations/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  remove: (id: string) => request<any>(`/locations/${id}`, { method: 'DELETE' }),
};

/* ─── Attendance ─────────────────────────────────────────────────────────── */
export const attendanceApi = {
  list: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<any[]>(`/attendance/punches${qs}`);
  },
  kioskClock: (data: { employee_number: string; pin_code: string; location_code: string; type: string; photo_url?: string; device_info?: any }) =>
    request<any>('/attendance/kiosk-clock', { method: 'POST', body: JSON.stringify(data) }),
  clock: (data: { user_id: string; location_id: string; type: string; method?: string; device_info?: any }) =>
    request<any>('/attendance/clock', { method: 'POST', body: JSON.stringify(data) }),
  adjustPunch: (id: string, data: { actualIn?: string; actualOut?: string }) =>
    request<any>(`/attendance/punch/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  approveOvertime: (id: string) =>
    request<any>(`/attendance/approve-overtime/${id}`, { method: 'PATCH' }),
};

/* ─── Schedules ──────────────────────────────────────────────────────────── */
export const schedulesApi = {
  list: () => request<any[]>('/schedules'),
  create: (data: any) => request<any>('/schedules', { method: 'POST', body: JSON.stringify(data) }),
};

/* ─── Audit Logs ─────────────────────────────────────────────────────────── */
export const auditApi = {
  list: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<any>(`/audit-logs${qs}`);
  },
};

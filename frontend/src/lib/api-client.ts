/**
 * Centralized API client for Admin Portal → NestJS Backend communication.
 * Backend runs on port 3001. Frontend on port 3000.
 */

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3001/api/v1');
if (!API_BASE) throw new Error('NEXT_PUBLIC_API_URL is required');

import { ApiError } from './api-error';
import { isPublicApiPath, recoverExpiredSession } from './session-recovery';

function getAuthHeader(): Record<string, string> {
  if (typeof window !== 'undefined') {
    const token = window.localStorage.getItem('nexustaff_token');
    if (token) {
      return { Authorization: `Bearer ${token}` };
    }
  }
  return {};
}

async function request<T>(path: string, options?: RequestInit, blob = false): Promise<T> {
  const headers = {
    'Content-Type': 'application/json',
    ...(isPublicApiPath(path) ? {} : getAuthHeader()),
    ...(options?.headers || {}),
  };

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    if (res.status === 401 && !isPublicApiPath(path) && path !== '/auth/logout') {
      recoverExpiredSession((headers as Record<string, string>).Authorization?.replace(/^Bearer /, '') || null);
    }
    let errMsg = `Request failed: ${res.status} ${res.statusText}`;
    try {
      const data = await res.json();
      errMsg = data?.message || errMsg;
    } catch (_) {}
    throw new ApiError(res.status, errMsg);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;
  return blob ? res.blob() as Promise<T> : res.json();
}

/* ─── Auth ───────────────────────────────────────────────────────────────── */
export const authApi = {
  login: (data: { email: string; password: string }) => request<any>('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  logout: () => request<any>('/auth/logout', { method: 'POST' }),
};

/* ─── Staff ─────────────────────────────────────────────────────────────── */
export const staffApi = {
  list: (includeInactive = false) => request<any[]>('/staff' + (includeInactive ? '?include_inactive=true' : '')),
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
  kioskIdentify: (data: { pin_code: string; property_id: string }) =>
    request<any>('/attendance/kiosk-identify', { method: 'POST', body: JSON.stringify(data) }),
  kioskStatus: (data: { employee_number: string; pin_code: string; property_id?: string; location_code?: string }) =>
    request<any>('/attendance/kiosk-status', { method: 'POST', body: JSON.stringify(data) }),
  kioskClock: (data: { employee_number: string; pin_code: string; property_id?: string; location_code?: string; type: string; photo_url?: string; device_info?: any }) =>
    request<any>('/attendance/kiosk-clock', { method: 'POST', body: JSON.stringify(data) }),
  clock: (data: { user_id?: string; location_id: string; type: string; method?: string; device_info?: any }) =>
    request<any>('/attendance/clock', { method: 'POST', body: JSON.stringify(data) }),
  adminClock: (data: { user_id: string; location_id: string; type: string; method?: string; device_info?: any }) =>
    request<any>('/attendance/admin-clock', { method: 'POST', body: JSON.stringify(data) }),
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

export const onboardingApi = {
  catalog: (id: string) => request<any>(`/onboarding/properties/${id}/catalog`),
  department: (id: string, data: any) => request<any>(`/onboarding/properties/${id}/departments`, { method: 'POST', body: JSON.stringify(data) }),
  position: (id: string, data: any) => request<any>(`/onboarding/properties/${id}/positions`, { method: 'POST', body: JSON.stringify(data) }),
  create: (data: any) => request<any>('/onboarding/employees', { method: 'POST', body: JSON.stringify(data) }),
  details: (id: string) => request<any>(`/onboarding/employees/${id}`),
  add: (id: string, data: any) => request<any>(`/onboarding/employees/${id}/assignments`, { method: 'POST', body: JSON.stringify(data) }),
  deactivate: (id: string, assignmentId: string) => request<any>(`/onboarding/employees/${id}/assignments/${assignmentId}/deactivate`, { method: 'PATCH' }),
  pin: (id: string) => request<any>(`/staff/${id}/pin`),
  resetPin: (id: string, pinCode: string) => request<any>(`/staff/${id}/pin`, { method: 'PATCH', body: JSON.stringify({ pinCode }) }),
};

export const reportsApi = {
  periodCsv: (kind: 'detail' | 'summary', params: Record<string,string>) => request<Blob>('/reports/attendance/' + kind + '.csv?' + new URLSearchParams(params), undefined, true),
};
export const periodApprovalApi = {
  getPolicy: (id:string)=>request<{requireApproval:boolean}>('/period-approvals/policy/'+encodeURIComponent(id)),
  policy: (id:string,requireApproval:boolean)=>request<any>('/period-approvals/policy/'+id,{method:'POST',body:JSON.stringify({requireApproval})}),
  list: (locationId:string)=>request<any[]>('/period-approvals?location_id='+encodeURIComponent(locationId)),
  resolve: (locationId:string,start:string,type:string)=>request<any>('/period-approvals/resolve',{method:'POST',body:JSON.stringify({locationId,start,type})}),
  review: (id:string)=>request<any>('/period-approvals/'+id),
  submit: (id:string,reviewToken:string)=>request<any>('/period-approvals/'+id+'/submit',{method:'POST',body:JSON.stringify({reviewToken})}),
  transition: (id:string,version:number,action:string,notes:string)=>request<any>('/period-approvals/timesheets/'+id+'/transition',{method:'POST',body:JSON.stringify({version,action,notes})}),
  configure: (id:string,steps:any[])=>request<any>('/period-approvals/workflow/'+id,{method:'POST',body:JSON.stringify({steps})}),
};
export const timeCorrectionsApi = {
  list: (locationId:string)=>request<any[]>('/time-corrections?location_id='+encodeURIComponent(locationId)),
  create: (data:any)=>request<any>('/time-corrections',{method:'POST',body:JSON.stringify(data)}),
  review: (id:string,action:'approve'|'reject',comments:string)=>request<any>('/time-corrections/'+id+'/'+action,{method:'PATCH',body:JSON.stringify({comments})}),
};
export const adminAccountsApi = {
  catalog:()=>request<any>('/admin-accounts/catalog'),
  list:()=>request<any[]>('/admin-accounts'),
  create:(data:any)=>request<any>('/admin-accounts',{method:'POST',body:JSON.stringify(data)}),
  update:(id:string,data:any)=>request<any>('/admin-accounts/'+id,{method:'PATCH',body:JSON.stringify(data)}),
  reset:(id:string,password:string,version:string)=>request<any>('/admin-accounts/'+id+'/password',{method:'POST',body:JSON.stringify({password,version})}),
};

export const ROLES = ['SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER', 'LOCATION_ADMIN', 'SUPERVISOR', 'WORKER'] as const;
export type Role = typeof ROLES[number];
export interface AdminIdentity {
  role: Role;
  companyId?: string | null;
  permissions?: string[];
  assignedLocationIds?: string[];
  propertyAccess?: { propertyId: string; permissions: string[] }[];
}
export function isAdminRole(role: unknown): role is Role {
  return typeof role === 'string' && ROLES.includes(role as Role) && role !== 'WORKER';
}
/** UI visibility only. The backend independently resolves tenant and property ownership. */
export function can(user: AdminIdentity | null | undefined, permission: string, propertyId?: string): boolean {
  if (!user || !isAdminRole(user.role)) return false;
  if (user.role === 'SUPER_ADMIN') return true;
  if (!user.companyId) return false;
  if (user.role === 'OWNER') return true;
  const selected = propertyId && propertyId !== 'ALL' ? propertyId : undefined;
  if (selected && !(user.assignedLocationIds || []).includes(selected) && !user.propertyAccess?.some(p => p.propertyId === selected)) return false;
  return !!user.permissions?.includes(permission) || !!user.propertyAccess?.some(p => (!selected || p.propertyId === selected) && p.permissions.includes(permission));
}
export function canOpenAdminRoute(user: AdminIdentity | null | undefined, route: string, propertyId?: string): boolean {
  if (!user || !isAdminRole(user.role)) return false;
  if (route.startsWith('/admin/schedules') && !['SUPER_ADMIN', 'LOCATION_ADMIN', 'SUPERVISOR'].includes(user.role)) return false;
  const rules: Record<string, string[]> = {
    '/admin/punches': ['TIME_VIEW'], '/admin/schedules': ['TIME_VIEW'],
    '/admin/employees': ['STAFF_VIEW'], '/admin/locations': ['PROPERTY_VIEW'],
    '/admin/reports': ['VIEW_PAYROLL', 'VIEW_INVOICES'],
  };
  if (route.startsWith('/admin/settings')) return user.role === 'SUPER_ADMIN';
  const key = Object.keys(rules).find(p => route === p || route.startsWith(p + '/'));
  return !key || rules[key].some(permission => can(user, permission, propertyId));
}
export function clearAuthStorage(storage: Pick<Storage, 'removeItem'>) {
  for (const key of ['nexustaff_token', 'nexustaff_user', 'nexustaff-auth-store']) storage.removeItem(key);
}

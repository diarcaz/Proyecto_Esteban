// Suggestions only: the server catalog and canonical save validation authorize grants.
const visibility = ['STAFF_VIEW', 'TIME_VIEW', 'TIME_APPROVE', 'PROPERTY_VIEW'];
const operations = [...visibility, 'STAFF_CREATE', 'STAFF_EDIT', 'STAFF_DELETE', 'TIME_EDIT'];
const recommendations: Record<string, string[]> = {
    SUPERVISOR: visibility, LOCATION_ADMIN: operations, MANAGER: operations,
    ADMIN: [...operations, 'PROPERTY_MANAGE'], OWNER: [],
};
export function recommendedPermissions(role: string, companyId: string, propertyId: string, catalog: any, editing: boolean): string[] {
    if (!catalog?.roles?.includes(role)) return [];
    const property = catalog.properties?.find((p: any) => p.id === propertyId && p.companyId === companyId && (editing ? p.canEdit : p.canCreate));
    if (!property) return [];
    return (recommendations[role] || []).filter(p => catalog.permissionNames?.includes(p) && property.permissions?.includes(p));
}
export function passwordRequirements(value: string) {
    return [
        { label: '16+ characters', met: value.length >= 16 },
        { label: 'Uppercase letter', met: /[A-Z]/.test(value) },
        { label: 'Lowercase letter', met: /[a-z]/.test(value) },
        { label: 'Number', met: /[0-9]/.test(value) },
        { label: 'Symbol', met: /[^a-zA-Z0-9]/.test(value) },
        { label: 'Within 72 UTF-8 bytes', met: value.length > 0 && new TextEncoder().encode(value).length <= 72 },
    ];
}

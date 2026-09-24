export function assignmentState(a: any, now = Date.now()) {
  if (!a.active) return 'Inactive';
  if (a.effectiveUntil && Date.parse(a.effectiveUntil) < now) return 'Expired';
  return Date.parse(a.effectiveFrom) > now ? 'Scheduled' : 'Current';
}
export function branchDate(value: string, timezone = 'UTC') {
  return new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}
// Interpret a wall-clock input in the persisted branch timezone, never the device zone.
// Reject DST gaps and repeated times rather than silently choosing another instant.
export function branchTimestamp(value: string, timezone: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw Error('Choose a valid assignment date and time.');
  const target = Date.parse(value + ':00Z');
  const formatter = new Intl.DateTimeFormat('sv-SE', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const wall = (t: number) => formatter.format(new Date(t)).replace(' ', 'T');
  const offsets = new Set([-86400000, 0, 86400000].map(delta => Date.parse(wall(target + delta) + ':00Z') - (target + delta)));
  const matches = [...offsets].map(offset => target - offset).filter(t => wall(t) === value);
  if (matches.length !== 1) throw Error('This branch-local time is skipped or repeated by daylight saving. Choose an unambiguous time.');
  return new Date(matches[0]).toISOString();
}
export function staffNumber(value: string) { return value.startsWith('EMP-') ? value : 'EMP-' + value; }
export const staffNumberHelp = 'Use EMP- followed by 1–40 letters, numbers or hyphens. Example: EMP-010101.';
export function staffError(error: any) {
  const message = String(error?.message || '');
  if (message === 'A staff member with this staff number already exists.') return message;
  if (/employeeNumber|regular expression|Staff number/i.test(message)) return staffNumberHelp;
  const safe = [
    'A staff member with this email already exists.', 'A staff member with these details already exists.',
    'Name and code are required.', 'Invalid assignment effective dates.',
    'Department does not belong to the selected property.', 'Department does not belong to this property.',
    'Position does not belong to the selected department/property or is inactive.',
    'An active assignment already overlaps these dates at this property. End or deactivate it first.',
    'Close the existing work shift before deactivating this assignment.',
    'Choose a valid assignment date and time.',
    'This branch-local time is skipped or repeated by daylight saving. Choose an unambiguous time.',
  ];
  if (safe.includes(message)) return message.replaceAll('property', 'Branch');
  if (error?.status === 403) return 'You do not have permission for this Staff or Branch operation.';
  if (error?.status === 409) return 'These details conflict with an existing record. Check the number or code and try again.';
  return 'Unable to complete this operation. Check the fields and Branch permissions, then try again.';
}
export function readinessText(r: any) {
  if (r.clockReady) return `This Staff member has a configured PIN and a current assignment for ${r.name}.`;
  switch (r.reason) {
    case 'STAFF_INACTIVE': return 'The Staff account is inactive.';
    case 'PIN_MISSING': return 'A six-digit PIN must be configured.';
    case 'ASSIGNMENT_SCHEDULED': return `This assignment begins ${branchDate(r.effectiveFrom, r.timezone)} (${r.timezone}).`;
    case 'ASSIGNMENT_EXPIRED': return 'The assignment has expired. Add a current work assignment.';
    case 'ASSIGNMENT_INACTIVE': return 'The assignment is inactive. Add a current work assignment.';
    case 'ASSIGNMENT_UNAVAILABLE': return 'The current assignment could not be verified. Refresh or contact an administrator.';
    default: return `No current assignment exists for ${r.name}.`;
  }
}

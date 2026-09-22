/** Presentation only: API identifiers and authorization values remain unchanged. */
const labels: Record<string, string> = {
  SUPER_ADMIN: 'Platform Administrator', OWNER: 'Owner', ADMIN: 'Administrator',
  LOCATION_ADMIN: 'Branch Administrator', MANAGER: 'Manager', SUPERVISOR: 'Supervisor', WORKER: 'Staff',
  STAFF_VIEW: 'View Staff', STAFF_CREATE: 'Add Staff', STAFF_EDIT: 'Edit Staff', STAFF_DELETE: 'Deactivate Staff',
  TIME_VIEW: 'View attendance & export hours', TIME_EDIT: 'Correct attendance', TIME_APPROVE: 'Review & approve hours',
  PROPERTY_VIEW: 'View branches', PROPERTY_MANAGE: 'Manage branches',
  MANAGERS_VIEW: 'View admin accounts', MANAGERS_CREATE: 'Add admin accounts', MANAGERS_EDIT: 'Edit admin accounts',
  VIEW_PAY_RATE: 'View pay rates', VIEW_BILL_RATE: 'View bill rates', VIEW_MARKUP: 'View markup',
  VIEW_PAYROLL: 'Payroll data visibility (when available)', VIEW_INVOICES: 'Invoice data visibility (when available)',
  VIEW_EMPLOYEE_PIN: 'View Staff PIN', RESET_EMPLOYEE_PIN: 'Reset Staff PIN',
  LUNCH_START: 'Break started', LUNCH_END: 'Break ended', CLOCK_IN: 'Clock in', CLOCK_OUT: 'Clock out',
  TERMINATED: 'Inactive', CORRECTION_REQUIRED: 'Correction Required', IN_REVIEW: 'In Review',
};
export function displayLabel(value: string = ''): string {
  return labels[value] || value.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export enum Permission {
  // Staff / User Management
  STAFF_VIEW = 'STAFF_VIEW',
  STAFF_CREATE = 'STAFF_CREATE',
  STAFF_EDIT = 'STAFF_EDIT',
  STAFF_DELETE = 'STAFF_DELETE',

  // Time & Attendance Management
  TIME_VIEW = 'TIME_VIEW',
  TIME_EDIT = 'TIME_EDIT',
  TIME_APPROVE = 'TIME_APPROVE',

  // Property / Location Management
  PROPERTY_VIEW = 'PROPERTY_VIEW',
  PROPERTY_MANAGE = 'PROPERTY_MANAGE',

  // Manager & Supervisor Administration
  MANAGERS_VIEW = 'MANAGERS_VIEW',
  MANAGERS_CREATE = 'MANAGERS_CREATE',
  MANAGERS_EDIT = 'MANAGERS_EDIT',

  // Financial Permissions (Field-level & Metric-level protection)
  VIEW_PAY_RATE = 'VIEW_PAY_RATE',
  VIEW_BILL_RATE = 'VIEW_BILL_RATE',
  VIEW_MARKUP = 'VIEW_MARKUP',
  VIEW_PAYROLL = 'VIEW_PAYROLL',
  VIEW_INVOICES = 'VIEW_INVOICES',

  // PIN Security Permissions
  VIEW_EMPLOYEE_PIN = 'VIEW_EMPLOYEE_PIN',
  RESET_EMPLOYEE_PIN = 'RESET_EMPLOYEE_PIN',
}

export interface AttendancePunch {
  id: string;
  userId: string;
  employeeNumber: string;
  employeeName: string;
  jobPositionCode: string;
  locationId: string;
  locationCode: string;
  scheduledIn?: string;
  scheduledOut?: string;
  actualIn?: string;
  actualOut?: string;
  lunchStart?: string;
  lunchEnd?: string;
  takenLunch: boolean;
  calculatedHours?: number;
  isOvertime: boolean;
  isOvertimeApproved: boolean;
  status: string;
}

export interface AuthorizedLocation {
  id: string;
  name: string;
  code: string;
  address: string;
  city: string;
  activeStaffCount: number;
  kioskCode?: string;
}

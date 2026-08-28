export interface EmployeeMock {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  jobPositionCode: string;
  locationId: string;
  locationCode: string;
  pinCode: string; // 6-digit PIN
  preferredLanguage: 'es' | 'en';
}

export interface LocationMock {
  id: string;
  name: string;
  code: string;
  address: string;
  city: string;
  activeStaffCount: number;
  kioskCode: string;
}

export interface PunchMock {
  id: string;
  userId: string;
  employeeNumber: string;
  employeeName: string;
  jobPositionCode: string;
  locationId: string;
  locationCode: string;
  scheduledIn: string;
  scheduledOut: string;
  actualIn?: string;
  actualOut?: string;
  lunchStart?: string;
  lunchEnd?: string;
  takenLunch: boolean;
  calculatedHours?: number;
  isOvertime: boolean;
  isOvertimeApproved?: boolean;
  status: 'ON_TIME' | 'LATE' | 'OVERTIME';
}

export const MOCK_LOCATIONS: LocationMock[] = [
  {
    id: 'loc-mid',
    name: 'Downtown Branch - MERIDA',
    code: 'MID-1001',
    address: 'Downtown Financial District',
    city: 'Merida, YUC',
    activeStaffCount: 48,
    kioskCode: '1001',
  },
  {
    id: 'loc-cun',
    name: 'Marina Plaza - CANCUN',
    code: 'CUN-1002',
    address: 'Kukulcan Blvd Km 12.5, Hotel Zone',
    city: 'Cancun, QROO',
    activeStaffCount: 52,
    kioskCode: '1002',
  },
  {
    id: 'loc-mty',
    name: 'North Corporate - MONTERREY',
    code: 'MTY-1003',
    address: 'Constitucion Ave 2000',
    city: 'Monterrey, NL',
    activeStaffCount: 65,
    kioskCode: '1003',
  },
];

export const MOCK_EMPLOYEES: EmployeeMock[] = [
  {
    id: 'emp-101',
    employeeNumber: 'EMP-1001',
    firstName: 'Carlos',
    lastName: 'Mendoza',
    jobPositionCode: 'SUPERVISOR',
    locationId: 'loc-mid',
    locationCode: 'MID-1001',
    pinCode: '100100',
    preferredLanguage: 'es',
  },
  {
    id: 'emp-102',
    employeeNumber: 'EMP-1002',
    firstName: 'Sofia',
    lastName: 'Ramírez',
    jobPositionCode: 'RECEPT',
    locationId: 'loc-mid',
    locationCode: 'MID-1001',
    pinCode: '100200',
    preferredLanguage: 'es',
  },
  {
    id: 'emp-103',
    employeeNumber: 'EMP-1003',
    firstName: 'John',
    lastName: 'Smith',
    jobPositionCode: 'IT_SPEC',
    locationId: 'loc-cun',
    locationCode: 'CUN-1002',
    pinCode: '100300',
    preferredLanguage: 'en',
  },
  {
    id: 'emp-104',
    employeeNumber: 'EMP-1004',
    firstName: 'Ana',
    lastName: 'Torres',
    jobPositionCode: 'OP_MNT',
    locationId: 'loc-cun',
    locationCode: 'CUN-1002',
    pinCode: '100400',
    preferredLanguage: 'es',
  },
  {
    id: 'emp-105',
    employeeNumber: 'EMP-1005',
    firstName: 'David',
    lastName: 'Miller',
    jobPositionCode: 'SUPERVISOR',
    locationId: 'loc-mty',
    locationCode: 'MTY-1003',
    pinCode: '100500',
    preferredLanguage: 'en',
  },
  {
    id: 'emp-106',
    employeeNumber: 'EMP-1006',
    firstName: 'Maria Elena',
    lastName: 'Lopez',
    jobPositionCode: 'CAJERO',
    locationId: 'loc-mty',
    locationCode: 'MTY-1003',
    pinCode: '100600',
    preferredLanguage: 'es',
  },
  {
    id: 'emp-107',
    employeeNumber: 'EMP-1007',
    firstName: 'Alejandro',
    lastName: 'Silva',
    jobPositionCode: 'LOGISTICA',
    locationId: 'loc-mid',
    locationCode: 'MID-1001',
    pinCode: '100700',
    preferredLanguage: 'es',
  },
  {
    id: 'emp-108',
    employeeNumber: 'EMP-1008',
    firstName: 'Emily',
    lastName: 'Davis',
    jobPositionCode: 'EVENTOS',
    locationId: 'loc-cun',
    locationCode: 'CUN-1002',
    pinCode: '100800',
    preferredLanguage: 'en',
  },
];

export const MOCK_PUNCHES: PunchMock[] = [
  {
    id: 'punch-101',
    userId: 'emp-101',
    employeeNumber: 'EMP-1001',
    employeeName: 'Carlos Mendoza',
    jobPositionCode: 'SUPERVISOR',
    locationId: 'loc-mid',
    locationCode: 'MID-1001',
    scheduledIn: '08:00 AM',
    scheduledOut: '04:30 PM',
    actualIn: '07:58 AM',
    actualOut: '04:32 PM',
    lunchStart: '12:00 PM',
    lunchEnd: '12:30 PM',
    takenLunch: true,
    calculatedHours: 8.0,
    isOvertime: false,
    status: 'ON_TIME',
  },
  {
    id: 'punch-102',
    userId: 'emp-102',
    employeeNumber: 'EMP-1002',
    employeeName: 'Sofia Ramírez',
    jobPositionCode: 'RECEPT',
    locationId: 'loc-mid',
    locationCode: 'MID-1001',
    scheduledIn: '08:00 AM',
    scheduledOut: '04:30 PM',
    actualIn: '08:25 AM',
    actualOut: undefined,
    lunchStart: undefined,
    lunchEnd: undefined,
    takenLunch: false,
    calculatedHours: 7.5,
    isOvertime: false,
    status: 'LATE',
  },
  {
    id: 'punch-103',
    userId: 'emp-103',
    employeeNumber: 'EMP-1003',
    employeeName: 'John Smith',
    jobPositionCode: 'IT_SPEC',
    locationId: 'loc-cun',
    locationCode: 'CUN-1002',
    scheduledIn: '07:00 AM',
    scheduledOut: '07:30 PM',
    actualIn: '06:52 AM',
    actualOut: '08:00 PM',
    lunchStart: '01:00 PM',
    lunchEnd: '01:30 PM',
    takenLunch: true,
    calculatedHours: 12.5,
    isOvertime: true,
    isOvertimeApproved: false,
    status: 'OVERTIME',
  },
  {
    id: 'punch-104',
    userId: 'emp-104',
    employeeNumber: 'EMP-1004',
    employeeName: 'Ana Torres',
    jobPositionCode: 'OP_MNT',
    locationId: 'loc-cun',
    locationCode: 'CUN-1002',
    scheduledIn: '08:00 AM',
    scheduledOut: '04:30 PM',
    actualIn: '07:56 AM',
    actualOut: undefined,
    lunchStart: '12:15 PM',
    lunchEnd: '12:45 PM',
    takenLunch: true,
    calculatedHours: 6.0,
    isOvertime: false,
    status: 'ON_TIME',
  },
  {
    id: 'punch-105',
    userId: 'emp-105',
    employeeNumber: 'EMP-1005',
    employeeName: 'David Miller',
    jobPositionCode: 'SUPERVISOR',
    locationId: 'loc-mty',
    locationCode: 'MTY-1003',
    scheduledIn: '08:00 AM',
    scheduledOut: '04:30 PM',
    actualIn: '07:59 AM',
    actualOut: '04:30 PM',
    lunchStart: '01:00 PM',
    lunchEnd: '01:30 PM',
    takenLunch: true,
    calculatedHours: 8.0,
    isOvertime: false,
    status: 'ON_TIME',
  },
  {
    id: 'punch-106',
    userId: 'emp-106',
    employeeNumber: 'EMP-1006',
    employeeName: 'Maria Elena Lopez',
    jobPositionCode: 'CAJERO',
    locationId: 'loc-mty',
    locationCode: 'MTY-1003',
    scheduledIn: '09:00 AM',
    scheduledOut: '05:30 PM',
    actualIn: '08:57 AM',
    actualOut: undefined,
    lunchStart: undefined,
    lunchEnd: undefined,
    takenLunch: false,
    calculatedHours: 7.0,
    isOvertime: false,
    status: 'ON_TIME',
  },
  {
    id: 'punch-107',
    userId: 'emp-107',
    employeeNumber: 'EMP-1007',
    employeeName: 'Alejandro Silva',
    jobPositionCode: 'LOGISTICA',
    locationId: 'loc-mid',
    locationCode: 'MID-1001',
    scheduledIn: '08:00 AM',
    scheduledOut: '04:30 PM',
    actualIn: '08:18 AM',
    actualOut: undefined,
    lunchStart: '12:00 PM',
    lunchEnd: '12:30 PM',
    takenLunch: true,
    calculatedHours: 7.8,
    isOvertime: false,
    status: 'LATE',
  },
  {
    id: 'punch-108',
    userId: 'emp-108',
    employeeNumber: 'EMP-1008',
    employeeName: 'Emily Davis',
    jobPositionCode: 'EVENTOS',
    locationId: 'loc-cun',
    locationCode: 'CUN-1002',
    scheduledIn: '10:00 AM',
    scheduledOut: '06:30 PM',
    actualIn: '09:55 AM',
    actualOut: '06:35 PM',
    lunchStart: '02:00 PM',
    lunchEnd: '02:30 PM',
    takenLunch: true,
    calculatedHours: 8.0,
    isOvertime: false,
    status: 'ON_TIME',
  },
];

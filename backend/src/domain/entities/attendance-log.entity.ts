import { AttendanceType, AttendanceStatus, AttendanceMethod } from '@prisma/client';

export { AttendanceType, AttendanceStatus, AttendanceMethod };

export interface GeoCoordinates {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

export interface DeviceInfo {
  deviceId?: string;
  ipAddress?: string;
  userAgent?: string;
  appVersion?: string;
}

export class AttendanceLogEntity {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly locationId: string,
    public readonly type: AttendanceType,
    public readonly method: AttendanceMethod,
    public readonly timestamp: Date,
    public readonly shiftScheduleId?: string,
    public readonly takenLunch: boolean = false,
    public readonly calculatedHours?: number,
    public readonly isOvertime: boolean = false,
    public readonly deviceInfo?: DeviceInfo,
    public readonly locationCoordinates?: GeoCoordinates,
    public readonly status: AttendanceStatus = AttendanceStatus.ON_TIME,
    public readonly createdAt?: Date,
    public readonly updatedAt?: Date,
  ) {}
}

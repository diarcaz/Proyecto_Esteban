import { AttendanceLogEntity } from '../entities/attendance-log.entity';

export interface IAttendanceRepository {
  create(log: Omit<AttendanceLogEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<AttendanceLogEntity>;
  findById(id: string): Promise<AttendanceLogEntity | null>;
  findByUserAndDateRange(userId: string, startDate: Date, endDate: Date): Promise<AttendanceLogEntity[]>;
  findByLocationAndDateRange(locationId: string, startDate: Date, endDate: Date): Promise<AttendanceLogEntity[]>;
  findLatestLogForUser(userId: string): Promise<AttendanceLogEntity | null>;
}

export const I_ATTENDANCE_REPOSITORY = Symbol('IAttendanceRepository');

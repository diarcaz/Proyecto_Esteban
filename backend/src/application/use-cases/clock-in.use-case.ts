import { Inject, Injectable, ForbiddenException } from '@nestjs/common';
import { I_ATTENDANCE_REPOSITORY, IAttendanceRepository } from '@domain/repositories/attendance.repository.interface';
import { AttendanceLogEntity, AttendanceMethod, AttendanceType, AttendanceStatus, GeoCoordinates, DeviceInfo } from '@domain/entities/attendance-log.entity';

export interface ClockInInputDto {
  userId: string;
  locationId: string;
  method: AttendanceMethod;
  timestamp?: Date;
  deviceInfo?: DeviceInfo;
  locationCoordinates?: GeoCoordinates;
}

@Injectable()
export class ClockInUseCase {
  constructor(
    @Inject(I_ATTENDANCE_REPOSITORY)
    private readonly attendanceRepo: IAttendanceRepository,
  ) {}

  async execute(input: ClockInInputDto): Promise<AttendanceLogEntity> {
    const timestamp = input.timestamp || new Date();

    const latestLog = await this.attendanceRepo.findLatestLogForUser(input.userId);
    if (latestLog && latestLog.type === AttendanceType.CLOCK_IN) {
      throw new ForbiddenException('User is already clocked in.');
    }

    const attendanceLog = await this.attendanceRepo.create({
      userId: input.userId,
      locationId: input.locationId,
      type: AttendanceType.CLOCK_IN,
      method: input.method,
      timestamp: timestamp,
      takenLunch: false,
      isOvertime: false,
      deviceInfo: input.deviceInfo,
      locationCoordinates: input.locationCoordinates,
      status: AttendanceStatus.ON_TIME,
    });

    return attendanceLog;
  }
}

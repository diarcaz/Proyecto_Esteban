import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IAttendanceRepository } from '@domain/repositories/attendance.repository.interface';
import { AttendanceLogEntity, AttendanceMethod, AttendanceType, AttendanceStatus, GeoCoordinates, DeviceInfo } from '@domain/entities/attendance-log.entity';

@Injectable()
export class PrismaAttendanceRepository implements IAttendanceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(log: Omit<AttendanceLogEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<AttendanceLogEntity> {
    const created = await this.prisma.attendanceLog.create({
      data: {
        userId: log.userId,
        locationId: log.locationId,
        punchType: log.type,
        punchMethod: log.method,
        timestamp: log.timestamp,
        actualTimestamp: log.timestamp,
        takenLunch: log.takenLunch,
        isOvertime: log.isOvertime,
        status: log.status,
        deviceInfo: log.deviceInfo as any,
        locationCoordinates: log.locationCoordinates as any,
      },
    });

    return this.mapToDomain(created);
  }

  async findById(id: string): Promise<AttendanceLogEntity | null> {
    const log = await this.prisma.attendanceLog.findUnique({ where: { id } });
    return log ? this.mapToDomain(log) : null;
  }

  async findByUserAndDateRange(userId: string, startDate: Date, endDate: Date): Promise<AttendanceLogEntity[]> {
    const logs = await this.prisma.attendanceLog.findMany({
      where: {
        userId,
        timestamp: { gte: startDate, lte: endDate },
      },
      orderBy: { timestamp: 'desc' },
    });

    return logs.map((l) => this.mapToDomain(l));
  }

  async findByLocationAndDateRange(locationId: string, startDate: Date, endDate: Date): Promise<AttendanceLogEntity[]> {
    const logs = await this.prisma.attendanceLog.findMany({
      where: {
        locationId,
        timestamp: { gte: startDate, lte: endDate },
      },
      orderBy: { timestamp: 'desc' },
    });

    return logs.map((l) => this.mapToDomain(l));
  }

  async findLatestLogForUser(userId: string): Promise<AttendanceLogEntity | null> {
    const log = await this.prisma.attendanceLog.findFirst({
      where: { userId },
      orderBy: { timestamp: 'desc' },
    });

    return log ? this.mapToDomain(log) : null;
  }

  private mapToDomain(raw: any): AttendanceLogEntity {
    return new AttendanceLogEntity(
      raw.id,
      raw.userId,
      raw.locationId,
      (raw.punchType || raw.type) as AttendanceType,
      (raw.punchMethod || raw.method) as AttendanceMethod,
      raw.timestamp,
      raw.shiftScheduleId || undefined,
      raw.takenLunch || false,
      raw.calculatedHours ? parseFloat(raw.calculatedHours.toString()) : undefined,
      raw.isOvertime || false,
      raw.deviceInfo as DeviceInfo | undefined,
      raw.locationCoordinates as GeoCoordinates | undefined,
      raw.status as AttendanceStatus,
      raw.createdAt,
    );
  }
}

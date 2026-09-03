import { Injectable } from '@nestjs/common';
import { PrismaService } from '@infrastructure/persistence/prisma/prisma.service';

@Injectable()
export class SchedulesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(allowedLocationIds?: string[]) {
    const where: any = {};
    if (allowedLocationIds && allowedLocationIds.length > 0) {
      where.locationId = { in: allowedLocationIds };
    }

    return (this.prisma as any).shiftSchedule.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employeeNumber: true,
            jobPositionCode: true,
          },
        },
        location: {
          select: {
            id: true,
            name: true,
            locationCode: true,
          },
        },
        shift: true,
      },
      orderBy: { scheduledIn: 'desc' },
      take: 100,
    });
  }

  async create(data: { userId: string; locationId: string; shiftId?: string; scheduledIn: string; scheduledOut: string }) {
    // If no shiftId provided, find or create default shift
    let shiftId = data.shiftId;
    if (!shiftId) {
      const existingShift = await (this.prisma as any).shift.findFirst({
        where: { locationId: data.locationId },
      });
      if (existingShift) {
        shiftId = existingShift.id;
      } else {
        const newShift = await (this.prisma as any).shift.create({
          data: {
            locationId: data.locationId,
            name: 'Turno Estándar',
            startTime: '08:00',
            endTime: '17:00',
            gracePeriodMins: 15,
          },
        });
        shiftId = newShift.id;
      }
    }

    return (this.prisma as any).shiftSchedule.create({
      data: {
        userId: data.userId,
        locationId: data.locationId,
        shiftId: shiftId!,
        scheduledIn: new Date(data.scheduledIn),
        scheduledOut: new Date(data.scheduledOut),
      },
      include: {
        user: true,
        location: true,
        shift: true,
      },
    });
  }
}

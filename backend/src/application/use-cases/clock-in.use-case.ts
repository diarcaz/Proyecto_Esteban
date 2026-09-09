/**
 * @deprecated Phase 3.2 (M): This legacy use-case bypassed the WorkShift-based attendance model.
 * All clock-in operations MUST use AttendanceService.processStandardClock() or processKioskClock(),
 * which delegate to WorkShiftService.processPunchSequence() for full lifecycle management.
 *
 * This file is retained for reference only and MUST NOT be used in production.
 * No active import references exist.
 */

import { Injectable, ForbiddenException } from '@nestjs/common';

export interface ClockInInputDto {
  userId: string;
  locationId: string;
  method: string;
  timestamp?: Date;
  deviceInfo?: Record<string, any>;
  locationCoordinates?: { latitude: number; longitude: number; accuracy?: number };
}

/**
 * @deprecated Use AttendanceService.processStandardClock() or processKioskClock() instead.
 */
@Injectable()
export class ClockInUseCase {
  async execute(_input: ClockInInputDto): Promise<never> {
    throw new ForbiddenException(
      'ClockInUseCase is deprecated (Phase 3.2). All clock-in operations must use AttendanceService → WorkShiftService pipeline.',
    );
  }
}

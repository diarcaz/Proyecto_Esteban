import { ForbiddenException } from '@nestjs/common';
import { AttendanceType as Action } from '@domain/entities/attendance-log.entity';

/** Pure transition policy. An overdue shift permits only a new CLOCK_IN at the same property. */
export function evaluateShiftState(userId: string, locationId: string, shift: any, logs: any[], timestamp: Date, maxMinutes = 960) {
  if (shift && (shift.userId !== userId || shift.locationId !== locationId)) {
    throw new ForbiddenException('An open shift exists at another property. Resolve that shift at its property first.');
  }
  const isOverdue = !!shift && (timestamp.getTime() - new Date(shift.clockInTimestamp).getTime()) / 60000 > maxMinutes;
  const last = logs[logs.length - 1]?.punchType || Action.CLOCK_IN;
  let allowedActions: Action[];
  let currentStatus = 'CLOCKED_IN';
  if (!shift) { currentStatus = 'CLOCKED_OUT'; allowedActions = [Action.CLOCK_IN]; }
  else if (isOverdue) { currentStatus = 'MISSED_CLOCK_OUT'; allowedActions = [Action.CLOCK_IN]; }
  else {
    const transitions: Partial<Record<Action, Action[]>> = {
      [Action.CLOCK_IN]: [Action.LUNCH_START, Action.CLOCK_OUT],
      [Action.LUNCH_START]: [Action.LUNCH_END],
      [Action.LUNCH_END]: [Action.LUNCH2_START, Action.CLOCK_OUT],
      [Action.LUNCH2_START]: [Action.LUNCH2_END],
      [Action.LUNCH2_END]: [Action.CLOCK_OUT],
    };
    allowedActions = transitions[last as Action] || [];
    if (last === Action.LUNCH_START || last === Action.LUNCH2_START) currentStatus = 'MEAL_BREAK';
  }
  return { isOverdue, currentStatus, allowedActions };
}

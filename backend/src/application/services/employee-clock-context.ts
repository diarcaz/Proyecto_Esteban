import { BadRequestException, ForbiddenException } from '@nestjs/common';

/** Shared by kiosk authentication and the transaction; legacy visibility grants are not clock assignments. */
export async function resolveEmployeeClockAssignment(db: any, userId: string, propertyId: string, timestamp: Date) {
  const assignments = await db.employeeAssignment.findMany({
    where: { userId, propertyId, active: true, effectiveFrom: { lte: timestamp },
      OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: timestamp } }] },
    include: { department: { select: { id: true, name: true } }, position: { select: { id: true, title: true } } },
    orderBy: { id: 'asc' },
  });
  if (!assignments.length) throw new ForbiddenException('No active employee assignment for this property.');
  const contexts = new Set(assignments.map((a: any) => `${a.departmentId}|${a.positionId}|${a.rateConfigurationId || 'null'}`));
  if (contexts.size > 1) throw new BadRequestException('Configuration ambiguity: conflicting active EmployeeAssignments. Contact an administrator.');
  return assignments[0];
}

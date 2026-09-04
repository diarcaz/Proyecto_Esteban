import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { UserRole } from '@domain/entities/user.entity';

export interface UserLocationContext {
  id?: string;
  role?: string;
  assignedLocationIds?: string[];
}

/**
 * Asserts that the current authenticated user has access permission for the resource's location(s).
 * - SUPER_ADMIN bypasses location checks.
 * - Non-SUPER_ADMIN users must have assignedLocationIds containing at least one of the resource's target location IDs.
 * - Throws ForbiddenException if access is denied.
 */
export function assertLocationAccess(
  user: UserLocationContext | null | undefined,
  resourceLocationId: string | string[] | null | undefined,
): void {
  if (!user) {
    throw new UnauthorizedException('User authentication context is missing.');
  }

  if (user.role === UserRole.SUPER_ADMIN || user.role === 'SUPER_ADMIN') {
    return;
  }

  const assigned: string[] = user.assignedLocationIds || [];
  if (assigned.length === 0) {
    throw new ForbiddenException('User has no assigned branch location access permissions.');
  }

  if (!resourceLocationId) {
    return;
  }

  if (Array.isArray(resourceLocationId)) {
    if (resourceLocationId.length === 0) {
      return;
    }
    const hasAccess = resourceLocationId.some((locId) => assigned.includes(locId));
    if (!hasAccess) {
      throw new ForbiddenException(
        'Access denied: You do not have permission to access resources in the target location(s).',
      );
    }
  } else {
    if (!assigned.includes(resourceLocationId)) {
      throw new ForbiddenException(
        `Access denied: You do not have permission for target location '${resourceLocationId}'.`,
      );
    }
  }
}

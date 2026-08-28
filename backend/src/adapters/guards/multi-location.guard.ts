import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@domain/entities/user.entity';

@Injectable()
export class MultiLocationGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const targetLocationId = request.headers['x-location-id'] || request.params.locationId || request.body.locationId;

    if (!user) {
      throw new ForbiddenException('User authentication context missing.');
    }

    if (user.role === UserRole.SUPER_ADMIN) {
      return true;
    }

    if (!targetLocationId) {
      throw new ForbiddenException('Location context is required for this operation.');
    }

    const assignedLocations: string[] = user.assignedLocationIds || [];
    const isAssigned = assignedLocations.includes(targetLocationId);

    if (!isAssigned) {
      throw new ForbiddenException(`Access denied for Location ID: ${targetLocationId}`);
    }

    return true;
  }
}

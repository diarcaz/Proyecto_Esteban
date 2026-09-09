import { PROPERTY_READ } from '../decorators/property-read.decorator';
import { Injectable, CanActivate, ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles-and-locations.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { UserRole } from '@domain/entities/user.entity';

@Injectable()
export class RolesAndLocationsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('User is not authenticated.');
    }

    if (requiredRoles && requiredRoles.length > 0) {
      const hasRole = requiredRoles.includes(user.role);
      if (!hasRole) {
        throw new ForbiddenException(`Role '${user.role}' is not authorized to access this resource.`);
      }
    }

    const contexts = [request.headers?.['x-location-id'], request.headers?.['x-property-id'], request.params?.locationId, request.params?.propertyId, request.body?.location_id, request.body?.property_id, request.query?.location_id, request.query?.property_id].filter(v => v !== undefined);
    if (contexts.some(v => typeof v !== 'string' || !v.trim()) || new Set(contexts).size > 1) throw new ForbiddenException('Conflicting or invalid property context.');
    const locationId = contexts[0];

    if (user.role === UserRole.SUPER_ADMIN) {
      return true;
    }

    // These list routes perform authoritative DB scope checks in PermissionsGuard and their service.
    if (this.reflector.get(PROPERTY_READ, context.getHandler())) return true;
    const assigned: string[] = user.assignedLocationIds || [];
    if (assigned.length === 0) {
      throw new ForbiddenException('User has no assigned branch locations.');
    }

    if (locationId) {
      if (!assigned.includes(locationId)) {
        throw new ForbiddenException(`Access denied for assigned locations scope. Targeted location '${locationId}' is invalid.`);
      }
    } else {
      if (request.query) {
        request.query.allowed_location_ids = assigned;
      }
    }

    return true;
  }
}

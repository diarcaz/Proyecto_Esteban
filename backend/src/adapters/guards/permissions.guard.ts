import { Injectable, CanActivate, ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { Permission } from '@domain/permissions/permission.enum';
import { AuthorizationService } from '@domain/security/authorization.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authzService: AuthorizationService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const requiredPermissions = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredPermissions || requiredPermissions.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) {
      throw new UnauthorizedException('User is not authenticated.');
    }

    const targetPropertyId =
      request.headers['x-property-id'] ||
      request.headers['x-location-id'] ||
      request.params.propertyId ||
      request.params.locationId ||
      request.body.property_id ||
      request.body.location_id ||
      request.query.property_id ||
      request.query.location_id;

    for (const permission of requiredPermissions) {
      if (!this.authzService.hasPermission(user, permission, targetPropertyId)) {
        throw new ForbiddenException(`Access denied: Missing required permission '${permission}'.`);
      }
    }

    return true;
  }
}

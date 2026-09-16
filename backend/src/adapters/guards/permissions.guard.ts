import { PROPERTY_READ } from '../decorators/property-read.decorator';
import { resolvePropertyReadScope } from '@domain/security/property-read-scope';
import { PrismaService } from '@infrastructure/persistence/prisma/prisma.service';
import { Injectable, CanActivate, ExecutionContext, ForbiddenException, UnauthorizedException, Optional } from '@nestjs/common';
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
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
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

    if (requiredPermissions.includes(Permission.TIME_APPROVE)) {
      const target = this.reflector.get<string>('APPROVAL_TARGET', context.getHandler());
      if (target !== 'correction' || !this.prisma || !request.params?.id ||
          !['SUPER_ADMIN','OWNER','ADMIN','MANAGER','LOCATION_ADMIN','SUPERVISOR'].includes(user.role)) {
        throw new ForbiddenException('Authoritative approval context required.');
      }
      return this.prisma.timeCorrectionRequest.findUnique({
        where: { id: request.params.id }, select: { propertyId: true, property: { select: { companyId: true } } },
      }).then(record => {
        if (!record?.property?.companyId) throw new ForbiddenException('Approval target unavailable.');
        const claims = [request.headers?.['x-property-id'], request.headers?.['x-location-id'], request.body?.property_id, request.body?.location_id, request.query?.property_id, request.query?.location_id].filter(v => v !== undefined);
        if (claims.some(v => v !== record.propertyId)) throw new ForbiddenException('Approval property context mismatch.');
        for (const permission of requiredPermissions) {
          this.authzService.assertPropertyAccess(user, record.propertyId, record.property.companyId);
          this.authzService.assertPermission(user, permission, record.propertyId, record.property.companyId);
        }
        return true;
      });
    }

    if (this.reflector.getAllAndOverride<boolean>('SERVER_PROPERTY_SCOPE', [context.getHandler(), context.getClass()])) {
      // Preliminary PIN capability check; StaffService then checks the actual target employee/company/property.
      for (const permission of requiredPermissions) {
        if (user.role !== 'SUPER_ADMIN' && !(user.role === 'OWNER' && user.companyId) && !user.permissions?.includes(permission) && !user.propertyAccess?.some((p: any) => p.permissions?.includes(permission))) throw new ForbiddenException(`Access denied: Missing required permission '${permission}'.`);
      }
      return true;
    }
    const propertyRead = this.reflector.get<Permission>(PROPERTY_READ, context.getHandler());
    if (propertyRead) {
      if (!this.prisma || !requiredPermissions.includes(propertyRead)) throw new ForbiddenException('Property authorization unavailable.');
      return resolvePropertyReadScope(this.prisma, user, request.query || {}, request.headers || {}, propertyRead).then(() => true);
    }
    const targetPropertyId =
      request.headers['x-property-id'] ||
      request.headers['x-location-id'] ||
      request.params?.propertyId ||
      request.params?.locationId ||
      request.body?.property_id ||
      request.body?.location_id ||
      request.query?.property_id ||
      request.query?.location_id;

    for (const permission of requiredPermissions) {
      if (!this.authzService.hasPermission(user, permission, targetPropertyId)) {
        throw new ForbiddenException(`Access denied: Missing required permission '${permission}'.`);
      }
    }

    return true;
  }
}

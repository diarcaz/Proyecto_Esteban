import { BadRequestException, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { AuthorizationService } from './authorization.service';
import { Permission } from '../permissions/permission.enum';

export async function resolvePropertyReadScope(prisma: any, currentUser: any, query: any, headers: Record<string, any>, permission: Permission) {
    const authz = new AuthorizationService();
    if (!currentUser?.id) throw new UnauthorizedException('Authentication required.');
    const contexts = [query.location_id, (query as any).property_id, headers['x-location-id'], headers['x-property-id']].filter(v => v !== undefined);
    if (contexts.some(v => typeof v !== 'string' || !v.trim()) || new Set(contexts).size > 1) throw new BadRequestException('Conflicting or invalid property context.');
    const target = contexts[0];
    let properties: any[];
    if (target) {
      const property = await prisma.location.findUnique({ where: { id: target }, select: { id: true, companyId: true } });
      if (!property) throw new ForbiddenException('Property access denied.');
      authz.assertPropertyAccess(currentUser, property.id, property.companyId);
      authz.assertPermission(currentUser, permission, property.id, property.companyId);
      properties = [property];
    } else {
      if (currentUser.role !== 'SUPER_ADMIN' && !currentUser.companyId) throw new ForbiddenException('Company context required.');
      const scope = currentUser.role === 'SUPER_ADMIN' ? {} : {
        companyId: currentUser.companyId,
        ...(currentUser.role === 'OWNER' ? {} : { id: { in: [...(currentUser.assignedLocationIds || []), ...(currentUser.propertyAccess || []).map((p: any) => p.propertyId)] } }),
      };
      properties = (await prisma.location.findMany({ where: scope, select: { id: true, companyId: true } }))
        .filter(p => authz.canAccessProperty(currentUser, p.id, p.companyId) && authz.hasPermission(currentUser, permission, p.id, p.companyId));
      if (!properties.length && currentUser.role !== 'SUPER_ADMIN') throw new ForbiddenException('No properties with the required permission.');
    }
    return properties;
}

import { SetMetadata } from '@nestjs/common';
import { Permission } from '@domain/permissions/permission.enum';

export const PROPERTY_READ = 'authorizedPropertyRead';
/** List endpoints whose scope is resolved from DB ownership by PermissionsGuard and the service. */
export const PropertyRead = (permission: Permission) => SetMetadata(PROPERTY_READ, permission);

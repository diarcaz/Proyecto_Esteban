import { Injectable, CanActivate, ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AuthorizationService } from '@domain/security/authorization.service';

@Injectable()
export class TenantGuard implements CanActivate {
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

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('User is not authenticated.');
    }

    if (user.role === 'SUPER_ADMIN') {
      return true;
    }

    const targetCompanyId = request.headers['x-company-id'] || request.params.companyId || request.query.company_id || request.body.company_id;

    if (targetCompanyId) {
      if (user.companyId && user.companyId !== targetCompanyId) {
        throw new ForbiddenException('Access denied: You cannot request resources belonging to another company tenant.');
      }
    }

    return true;
  }
}

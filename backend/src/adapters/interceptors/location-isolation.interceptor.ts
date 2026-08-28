import { Injectable, NestInterceptor, ExecutionContext, CallHandler, ForbiddenException } from '@nestjs/common';
import { Observable } from 'rxjs';
import { UserRole } from '@domain/entities/user.entity';

@Injectable()
export class LocationIsolationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      return next.handle();
    }

    if (user.role === UserRole.SUPER_ADMIN) {
      return next.handle();
    }

    const assignedLocations: string[] = user.assignedLocationIds || [];

    if (assignedLocations.length === 0) {
      throw new ForbiddenException('User has no assigned branch locations');
    }

    if (request.query) {
      if (request.query.location_id) {
        if (!assignedLocations.includes(request.query.location_id)) {
          throw new ForbiddenException(`Requested location '${request.query.location_id}' is out of assigned branch scope.`);
        }
      } else {
        request.query.allowed_location_ids = assignedLocations;
      }
    }

    if (request.body && request.body.location_id) {
      if (!assignedLocations.includes(request.body.location_id)) {
        throw new ForbiddenException(`Payload location '${request.body.location_id}' is outside assigned branch scope.`);
      }
    }

    return next.handle();
  }
}

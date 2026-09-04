import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { RedisModule } from '@infrastructure/cache/redis.module';
import { AuthModule } from '@infrastructure/auth/auth.module';
import { PrismaService } from '@infrastructure/persistence/prisma/prisma.service';
import { AttendanceService } from '@application/services/attendance.service';
import { ReportsService } from '@application/services/reports.service';
import { StaffService } from '@application/services/staff.service';
import { LocationService } from '@application/services/location.service';
import { AuditService } from '@application/services/audit.service';
import { SchedulesService } from '@application/services/schedules.service';
import { AuthorizationService } from '@domain/security/authorization.service';
import { AttendanceController } from '@adapters/controllers/attendance.controller';
import { ReportsController } from '@adapters/controllers/reports.controller';
import { StaffController } from '@adapters/controllers/staff.controller';
import { LocationController } from '@adapters/controllers/location.controller';
import { AuditController } from '@adapters/controllers/audit.controller';
import { SchedulesController } from '@adapters/controllers/schedules.controller';
import { HealthController } from '@adapters/controllers/health.controller';
import { JwtAuthGuard } from '@adapters/guards/jwt-auth.guard';
import { RolesAndLocationsGuard } from '@adapters/guards/roles-and-locations.guard';
import { TenantGuard } from '@adapters/guards/tenant.guard';
import { PermissionsGuard } from '@adapters/guards/permissions.guard';
import { NotificationsGateway } from '@infrastructure/notifications/notifications.gateway';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
    RedisModule,
    AuthModule,
  ],
  controllers: [
    HealthController,
    AttendanceController,
    ReportsController,
    StaffController,
    LocationController,
    AuditController,
    SchedulesController,
  ],
  providers: [
    PrismaService,
    AuthorizationService,
    AttendanceService,
    ReportsService,
    StaffService,
    LocationService,
    AuditService,
    SchedulesService,
    NotificationsGateway,
    TenantGuard,
    PermissionsGuard,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesAndLocationsGuard,
    },
  ],
})
export class AppModule {}

import { Roles } from '../decorators/roles-and-locations.decorator';
import { UserRole } from '@prisma/client';
import { SetMetadata, Controller, Get, Post, Patch, Body, Param, Req, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { OnboardingService } from '@application/services/onboarding.service';
import { TenantGuard } from '@adapters/guards/tenant.guard';
import { AssignmentDto, OnboardEmployeeDto, DepartmentDto, PositionDto } from '@adapters/dtos/onboarding.dtos';
// Services resolve every property company and permission from the authenticated principal and DB.
@SetMetadata('SERVER_PROPERTY_SCOPE', true)
@Controller('api/v1/onboarding')
@UseGuards(TenantGuard)
@Roles(UserRole.SUPER_ADMIN,UserRole.OWNER,UserRole.ADMIN,UserRole.MANAGER,UserRole.LOCATION_ADMIN,UserRole.SUPERVISOR)
export class OnboardingController {
  constructor(private readonly service: OnboardingService) {}
  @Get('properties/:id/catalog') catalog(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) { return this.service.catalog(id, req.user); }
  @Post('properties/:id/departments') department(@Param('id', ParseUUIDPipe) id: string, @Body() body: DepartmentDto, @Req() req: any) { return this.service.createDepartment(id, body, req.user); }
  @Post('properties/:id/positions') position(@Param('id', ParseUUIDPipe) id: string, @Body() body: PositionDto, @Req() req: any) { return this.service.createPosition(id, body, req.user); }
  @Post('employees') create(@Body() body: OnboardEmployeeDto, @Req() req: any) { return this.service.create(body, req.user); }
  @Get('employees/:id') details(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) { return this.service.details(id, req.user); }
  @Post('employees/:id/assignments') add(@Param('id', ParseUUIDPipe) id: string, @Body() body: AssignmentDto, @Req() req: any) { return this.service.add(id, body, req.user); }
  @Patch('employees/:id/assignments/:assignmentId/deactivate') deactivate(@Param('id', ParseUUIDPipe) id: string, @Param('assignmentId', ParseUUIDPipe) assignmentId: string, @Req() req: any) { return this.service.deactivate(id, assignmentId, req.user); }
}

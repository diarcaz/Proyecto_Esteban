import { Controller, Get, Post, Patch, Delete, Body, Param, BadRequestException, NotFoundException, ForbiddenException, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { LocationService } from '../../application/services/location.service';
import { Roles } from '@adapters/decorators/roles-and-locations.decorator';
import { UserRole } from '@domain/entities/user.entity';
import { TenantGuard } from '@adapters/guards/tenant.guard';
import { PermissionsGuard } from '@adapters/guards/permissions.guard';
import { RequirePermissions } from '@adapters/decorators/permissions.decorator';
import { Permission } from '@domain/permissions/permission.enum';

@ApiTags('Locations')
@Controller('api/v1/locations')
@UseGuards(TenantGuard, PermissionsGuard)
export class LocationController {
  constructor(private readonly locationService: LocationService) {}

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER, UserRole.LOCATION_ADMIN, UserRole.SUPERVISOR)
  @RequirePermissions(Permission.PROPERTY_VIEW)
  @ApiOperation({ summary: 'List branch locations for authorized company/properties' })
  async findAll(@Req() req: any) {
    try {
      const allowedLocationIds = req.query.allowed_location_ids as string[] | undefined;
      return await this.locationService.findAll(allowedLocationIds, req.user);
    } catch (e: any) {
      if (e instanceof ForbiddenException || e instanceof NotFoundException) throw e;
      throw new BadRequestException(e.message || 'Failed to fetch locations');
    }
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.ADMIN)
  @RequirePermissions(Permission.PROPERTY_MANAGE)
  @ApiOperation({ summary: 'Create new branch location / property' })
  async create(@Body() body: any, @Req() req: any) {
    try {
      return await this.locationService.create(body, req.user);
    } catch (e: any) {
      if (e instanceof ForbiddenException || e instanceof NotFoundException) throw e;
      throw new BadRequestException(e.message || 'Failed to create branch location');
    }
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER, UserRole.LOCATION_ADMIN)
  @RequirePermissions(Permission.PROPERTY_MANAGE)
  @ApiOperation({ summary: 'Update branch location / property' })
  async update(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    try {
      return await this.locationService.update(id, body, req.user);
    } catch (e: any) {
      if (e instanceof ForbiddenException || e instanceof NotFoundException) throw e;
      throw new BadRequestException(e.message || `Failed to update location ${id}`);
    }
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER)
  @RequirePermissions(Permission.PROPERTY_MANAGE)
  @ApiOperation({ summary: 'Delete branch location / property' })
  async remove(@Param('id') id: string, @Req() req: any) {
    try {
      return await this.locationService.remove(id, req.user);
    } catch (e: any) {
      if (e instanceof ForbiddenException || e instanceof NotFoundException) throw e;
      throw new BadRequestException(e.message || `Failed to delete location ${id}`);
    }
  }
}

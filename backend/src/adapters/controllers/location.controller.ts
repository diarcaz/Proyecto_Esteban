import { Controller, Get, Post, Patch, Delete, Body, Param, BadRequestException, NotFoundException, ForbiddenException, Req } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { LocationService } from '../../application/services/location.service';
import { Roles } from '@adapters/decorators/roles-and-locations.decorator';
import { UserRole } from '@domain/entities/user.entity';

@ApiTags('Locations')
@Controller('api/v1/locations')
export class LocationController {
  constructor(private readonly locationService: LocationService) {}

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.LOCATION_ADMIN, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'List all branch locations' })
  async findAll(@Req() req: any) {
    try {
      const allowedLocationIds = req.query.allowed_location_ids as string[] | undefined;
      return await this.locationService.findAll(allowedLocationIds);
    } catch (e: any) {
      if (e instanceof ForbiddenException || e instanceof NotFoundException) throw e;
      throw new BadRequestException(e.message || 'Failed to fetch locations');
    }
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create new branch location' })
  async create(@Body() body: any) {
    try {
      return await this.locationService.create(body);
    } catch (e: any) {
      if (e instanceof ForbiddenException || e instanceof NotFoundException) throw e;
      throw new BadRequestException(e.message || 'Failed to create branch location');
    }
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.LOCATION_ADMIN)
  @ApiOperation({ summary: 'Update branch location' })
  async update(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    try {
      return await this.locationService.update(id, body, req.user);
    } catch (e: any) {
      if (e instanceof ForbiddenException || e instanceof NotFoundException) throw e;
      throw new BadRequestException(e.message || `Failed to update location ${id}`);
    }
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Delete branch location' })
  async remove(@Param('id') id: string, @Req() req: any) {
    try {
      return await this.locationService.remove(id, req.user);
    } catch (e: any) {
      if (e instanceof ForbiddenException || e instanceof NotFoundException) throw e;
      throw new BadRequestException(e.message || `Failed to delete location ${id}`);
    }
  }
}

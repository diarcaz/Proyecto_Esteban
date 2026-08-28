import { Controller, Get, Post, Patch, Delete, Body, Param, BadRequestException, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { LocationService } from '../../application/services/location.service';

@ApiTags('Locations')
@Controller('api/v1/locations')
export class LocationController {
  constructor(private readonly locationService: LocationService) {}

  @Get()
  @ApiOperation({ summary: 'List all branch locations' })
  async findAll() {
    try {
      return await this.locationService.findAll();
    } catch (e: any) {
      throw new BadRequestException(e.message || 'Failed to fetch locations');
    }
  }

  @Post()
  @ApiOperation({ summary: 'Create new branch location' })
  async create(@Body() body: any) {
    try {
      return await this.locationService.create(body);
    } catch (e: any) {
      throw new BadRequestException(e.message || 'Failed to create branch location');
    }
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update branch location' })
  async update(@Param('id') id: string, @Body() body: any) {
    try {
      return await this.locationService.update(id, body);
    } catch (e: any) {
      throw new BadRequestException(e.message || `Failed to update location ${id}`);
    }
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete branch location' })
  async remove(@Param('id') id: string) {
    try {
      return await this.locationService.remove(id);
    } catch (e: any) {
      throw new BadRequestException(e.message || `Failed to delete location ${id}`);
    }
  }
}

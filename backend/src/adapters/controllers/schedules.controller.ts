import { Controller, Get, Post, Body, BadRequestException, Req } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SchedulesService } from '../../application/services/schedules.service';
import { Roles } from '@adapters/decorators/roles-and-locations.decorator';
import { UserRole } from '@domain/entities/user.entity';

@ApiTags('Schedules')
@Controller('api/v1/schedules')
export class SchedulesController {
  constructor(private readonly schedulesService: SchedulesService) {}

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.LOCATION_ADMIN, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'List all shift schedules' })
  async findAll(@Req() req: any) {
    try {
      const allowedLocationIds = req.query.allowed_location_ids as string[] | undefined;
      return await this.schedulesService.findAll(allowedLocationIds);
    } catch (e: any) {
      throw new BadRequestException(e.message || 'Failed to fetch shift schedules');
    }
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.LOCATION_ADMIN)
  @ApiOperation({ summary: 'Create a new shift schedule' })
  async create(@Body() body: any) {
    try {
      return await this.schedulesService.create(body);
    } catch (e: any) {
      throw new BadRequestException(e.message || 'Failed to create shift schedule');
    }
  }
}

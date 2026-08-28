import { Controller, Get, Post, Body, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SchedulesService } from '../../application/services/schedules.service';

@ApiTags('Schedules')
@Controller('api/v1/schedules')
export class SchedulesController {
  constructor(private readonly schedulesService: SchedulesService) {}

  @Get()
  @ApiOperation({ summary: 'List all shift schedules' })
  async findAll() {
    try {
      return await this.schedulesService.findAll();
    } catch (e: any) {
      throw new BadRequestException(e.message || 'Failed to fetch shift schedules');
    }
  }

  @Post()
  @ApiOperation({ summary: 'Create a new shift schedule' })
  async create(@Body() body: any) {
    try {
      return await this.schedulesService.create(body);
    } catch (e: any) {
      throw new BadRequestException(e.message || 'Failed to create shift schedule');
    }
  }
}

import { Controller, Get, Post, Patch, Delete, Body, Param, BadRequestException, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { StaffService } from '../../application/services/staff.service';

@ApiTags('Staff')
@Controller('api/v1/staff')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Get()
  @ApiOperation({ summary: 'List all active staff members' })
  async findAll() {
    try {
      return await this.staffService.findAll();
    } catch (e: any) {
      throw new BadRequestException(e.message || 'Failed to fetch staff members');
    }
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get staff member by ID' })
  async findOne(@Param('id') id: string) {
    try {
      return await this.staffService.findOne(id);
    } catch (e: any) {
      throw new NotFoundException(e.message || `Staff member ${id} not found`);
    }
  }

  @Post()
  @ApiOperation({ summary: 'Create new staff member' })
  async create(@Body() body: any) {
    try {
      return await this.staffService.create(body);
    } catch (e: any) {
      throw new BadRequestException(e.message || 'Failed to create staff member');
    }
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update staff member' })
  async update(@Param('id') id: string, @Body() body: any) {
    try {
      return await this.staffService.update(id, body);
    } catch (e: any) {
      throw new BadRequestException(e.message || `Failed to update staff member ${id}`);
    }
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove (soft-delete) staff member' })
  async remove(@Param('id') id: string) {
    try {
      return await this.staffService.remove(id);
    } catch (e: any) {
      throw new BadRequestException(e.message || `Failed to delete staff member ${id}`);
    }
  }
}

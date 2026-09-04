import { Controller, Get, Post, Patch, Delete, Body, Param, BadRequestException, NotFoundException, ForbiddenException, Req } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { StaffService } from '../../application/services/staff.service';
import { Roles } from '@adapters/decorators/roles-and-locations.decorator';
import { UserRole } from '@domain/entities/user.entity';

@ApiTags('Staff')
@Controller('api/v1/staff')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.LOCATION_ADMIN, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'List all active staff members' })
  async findAll(@Req() req: any) {
    try {
      const allowedLocationIds = req.query.allowed_location_ids as string[] | undefined;
      return await this.staffService.findAll(allowedLocationIds, req.user);
    } catch (e: any) {
      if (e instanceof ForbiddenException || e instanceof NotFoundException) throw e;
      throw new BadRequestException(e.message || 'Failed to fetch staff members');
    }
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.LOCATION_ADMIN, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Get staff member by ID' })
  async findOne(@Param('id') id: string, @Req() req: any) {
    try {
      return await this.staffService.findOne(id, req.user);
    } catch (e: any) {
      if (e instanceof ForbiddenException || e instanceof NotFoundException) throw e;
      throw new NotFoundException(e.message || `Staff member ${id} not found`);
    }
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.LOCATION_ADMIN)
  @ApiOperation({ summary: 'Create new staff member' })
  async create(@Body() body: any, @Req() req: any) {
    try {
      return await this.staffService.create(body, req.user);
    } catch (e: any) {
      if (e instanceof ForbiddenException || e instanceof NotFoundException) throw e;
      throw new BadRequestException(e.message || 'Failed to create staff member');
    }
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.LOCATION_ADMIN)
  @ApiOperation({ summary: 'Update staff member' })
  async update(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    try {
      return await this.staffService.update(id, body, req.user);
    } catch (e: any) {
      if (e instanceof ForbiddenException || e instanceof NotFoundException) throw e;
      throw new BadRequestException(e.message || `Failed to update staff member ${id}`);
    }
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.LOCATION_ADMIN)
  @ApiOperation({ summary: 'Remove (soft-delete) staff member' })
  async remove(@Param('id') id: string, @Req() req: any) {
    try {
      return await this.staffService.remove(id, req.user);
    } catch (e: any) {
      if (e instanceof ForbiddenException || e instanceof NotFoundException) throw e;
      throw new BadRequestException(e.message || `Failed to delete staff member ${id}`);
    }
  }
}

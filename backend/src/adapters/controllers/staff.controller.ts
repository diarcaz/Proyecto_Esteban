import { Controller, Get, Post, Patch, Delete, Body, Param, BadRequestException, NotFoundException, ForbiddenException, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { StaffService } from '../../application/services/staff.service';
import { Roles } from '@adapters/decorators/roles-and-locations.decorator';
import { UserRole } from '@domain/entities/user.entity';
import { RequirePermissions } from '@adapters/decorators/permissions.decorator';
import { Permission } from '@domain/permissions/permission.enum';
import { PermissionsGuard } from '@adapters/guards/permissions.guard';
import { TenantGuard } from '@adapters/guards/tenant.guard';

@ApiTags('Staff')
@Controller('api/v1/staff')
@UseGuards(TenantGuard, PermissionsGuard)
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER, UserRole.LOCATION_ADMIN, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'List active staff members in authorized company/properties' })
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
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER, UserRole.LOCATION_ADMIN, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Get staff member by ID' })
  async findOne(@Param('id') id: string, @Req() req: any) {
    try {
      return await this.staffService.findOne(id, req.user);
    } catch (e: any) {
      if (e instanceof ForbiddenException || e instanceof NotFoundException) throw e;
      throw new NotFoundException(e.message || `Staff member ${id} not found`);
    }
  }

  @Get(':id/pin')
  @RequirePermissions(Permission.VIEW_EMPLOYEE_PIN)
  @ApiOperation({ summary: 'Get decrypted employee 6-digit PIN (requires VIEW_EMPLOYEE_PIN permission)' })
  async getPin(@Param('id') id: string, @Req() req: any) {
    try {
      return await this.staffService.getDecryptedPin(id, req.user);
    } catch (e: any) {
      if (e instanceof ForbiddenException || e instanceof NotFoundException) throw e;
      throw new BadRequestException(e.message || `Failed to retrieve PIN for staff member ${id}`);
    }
  }

  @Patch(':id/pin')
  @RequirePermissions(Permission.RESET_EMPLOYEE_PIN)
  @ApiOperation({ summary: 'Reset employee 6-digit PIN (requires RESET_EMPLOYEE_PIN permission)' })
  async resetPin(@Param('id') id: string, @Body('pinCode') pinCode: string, @Req() req: any) {
    try {
      return await this.staffService.resetPin(id, pinCode, req.user);
    } catch (e: any) {
      if (e instanceof ForbiddenException || e instanceof NotFoundException) throw e;
      throw new BadRequestException(e.message || `Failed to reset PIN for staff member ${id}`);
    }
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER, UserRole.LOCATION_ADMIN)
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
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER, UserRole.LOCATION_ADMIN)
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
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.ADMIN, UserRole.LOCATION_ADMIN)
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

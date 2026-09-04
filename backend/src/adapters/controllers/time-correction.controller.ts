import { Controller, Get, Post, Patch, Body, Param, Query, Req, UseGuards, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { TimeCorrectionService } from '../../application/services/time-correction.service';
import { TenantGuard } from '@adapters/guards/tenant.guard';
import { PermissionsGuard } from '@adapters/guards/permissions.guard';
import { RequirePermissions } from '@adapters/decorators/permissions.decorator';
import { Permission } from '@domain/permissions/permission.enum';
import { CreateTimeCorrectionDto, ReviewTimeCorrectionDto } from '@adapters/dtos/time-correction.dtos';

@ApiTags('TimeCorrections')
@Controller('api/v1/time-corrections')
@UseGuards(TenantGuard, PermissionsGuard)
export class TimeCorrectionController {
  constructor(private readonly timeCorrectionService: TimeCorrectionService) {}

  @Post()
  @ApiOperation({ summary: 'Submit a new time correction request (MISSED_CLOCK_OUT, INCORRECT_CLOCK_IN, INCORRECT_CLOCK_OUT)' })
  async create(@Body() dto: CreateTimeCorrectionDto, @Req() req: any) {
    try {
      return await this.timeCorrectionService.createCorrectionRequest(dto, req.user);
    } catch (e: any) {
      if (e instanceof ForbiddenException || e instanceof NotFoundException) throw e;
      throw new BadRequestException(e.message || 'Failed to create time correction request');
    }
  }

  @Get()
  @ApiOperation({ summary: 'List time correction requests for authorized company and properties' })
  async findAll(@Query() query: any, @Req() req: any) {
    try {
      return await this.timeCorrectionService.getCorrectionRequests(req.user, query);
    } catch (e: any) {
      if (e instanceof ForbiddenException || e instanceof NotFoundException) throw e;
      throw new BadRequestException(e.message || 'Failed to fetch time correction requests');
    }
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get time correction request detail by ID' })
  async findOne(@Param('id') id: string, @Req() req: any) {
    try {
      return await this.timeCorrectionService.getCorrectionRequestById(id, req.user);
    } catch (e: any) {
      if (e instanceof ForbiddenException || e instanceof NotFoundException) throw e;
      throw new NotFoundException(e.message || `TimeCorrectionRequest ${id} not found`);
    }
  }

  @Patch(':id/approve')
  @RequirePermissions(Permission.TIME_APPROVE)
  @ApiOperation({ summary: 'Approve a pending time correction request (requires TIME_APPROVE permission)' })
  async approve(@Param('id') id: string, @Body() dto: ReviewTimeCorrectionDto, @Req() req: any) {
    try {
      return await this.timeCorrectionService.approveCorrectionRequest(id, dto, req.user);
    } catch (e: any) {
      if (e instanceof ForbiddenException || e instanceof NotFoundException) throw e;
      throw new BadRequestException(e.message || `Failed to approve time correction request ${id}`);
    }
  }

  @Patch(':id/reject')
  @RequirePermissions(Permission.TIME_APPROVE)
  @ApiOperation({ summary: 'Reject a pending time correction request (requires TIME_APPROVE permission)' })
  async reject(@Param('id') id: string, @Body() dto: ReviewTimeCorrectionDto, @Req() req: any) {
    try {
      return await this.timeCorrectionService.rejectCorrectionRequest(id, dto, req.user);
    } catch (e: any) {
      if (e instanceof ForbiddenException || e instanceof NotFoundException) throw e;
      throw new BadRequestException(e.message || `Failed to reject time correction request ${id}`);
    }
  }
}

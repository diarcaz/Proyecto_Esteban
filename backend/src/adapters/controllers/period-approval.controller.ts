import { Controller, Get, Post, Param, Body, Query, Req, UseGuards } from '@nestjs/common';
import { IsUUID, IsIn, IsString, Matches, IsInt, Min, MaxLength, IsArray } from 'class-validator';
import { PeriodApprovalService } from '@application/services/period-approval.service';
import { TenantGuard } from '../guards/tenant.guard';
import { Roles } from '../decorators/roles-and-locations.decorator';
import { UserRole } from '@prisma/client';
class ResolvePeriodDto {
    @IsUUID()
    locationId!: string;
    @Matches(/^\d{4}-\d{2}-\d{2}$/)
    start!: string;
    @IsIn(['weekly', 'biweekly'])
    type!: 'weekly' | 'biweekly';
}
class SubmitPeriodDto {
    @IsString()
    @Matches(/^[a-f0-9]{64}$/)
    reviewToken!: string;
}
class TransitionDto {
    @IsInt()
    @Min(0)
    version!: number;
    @IsIn(['APPROVE', 'REJECT', 'CORRECTION_REQUIRED'])
    action!: string;
    @IsString()
    @MaxLength(2000)
    notes!: string;
}
class WorkflowDto {
    @IsArray()
    steps!: any[];
}
@Controller('api/v1/period-approvals')
@UseGuards(TenantGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER, UserRole.LOCATION_ADMIN, UserRole.SUPERVISOR)
export class PeriodApprovalController {
    constructor(private readonly service: PeriodApprovalService) { }
    @Get()
    list(
    @Query('location_id')
    id: string, 
    @Req()
    req: any) { return this.service.list(id, req.user); }
    @Post('resolve')
    resolve(
    @Body()
    body: ResolvePeriodDto, 
    @Req()
    req: any) { return this.service.resolve(body.locationId, body.start, body.type, req.user); }
    @Post('workflow/:locationId')
    configure(
    @Param('locationId')
    id: string, 
    @Body()
    body: WorkflowDto, 
    @Req()
    req: any) { return this.service.configure(id, body.steps, req.user); }
    @Get(':id')
    review(
    @Param('id')
    id: string, 
    @Req()
    req: any) { return this.service.review(id, req.user); }
    @Post(':id/submit')
    submit(
    @Param('id')
    id: string, 
    @Body()
    body: SubmitPeriodDto, 
    @Req()
    req: any) { return this.service.submit(id, body.reviewToken, req.user); }
    @Post('timesheets/:id/transition')
    transition(
    @Param('id')
    id: string, 
    @Body()
    body: TransitionDto, 
    @Req()
    req: any) { return this.service.transition(id, body.version, body.action, body.notes, req.user); }
}

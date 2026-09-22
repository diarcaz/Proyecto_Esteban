import { SetMetadata, HttpException, ServiceUnavailableException, Controller, Get, Post, Patch, Param, Body, Req, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { IsString, IsEmail, IsUUID, IsIn, IsArray, IsOptional, ValidateNested, MaxLength, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';
import { AdminAccountsService, ACCOUNT_ROLES } from '@application/services/admin-accounts.service';
import { TenantGuard } from '../guards/tenant.guard';
import { Roles } from '../decorators/roles-and-locations.decorator';
import { UserRole } from '@prisma/client';
class GrantDto {
    @IsUUID()
    propertyId!: string;
    @IsArray()
    @ArrayMaxSize(40)
    @IsString({ each: true })
    permissions!: string[];
}
class AccountDto {
    @IsString()
    @MaxLength(100)
    firstName!: string;
    @IsString()
    @MaxLength(100)
    lastName!: string;
    @IsOptional()
    @IsEmail()
    @MaxLength(254)
    email?: string;
    @IsIn(ACCOUNT_ROLES)
    role!: string;
    @IsUUID()
    companyId!: string;
    @IsIn(['ACTIVE', 'TERMINATED'])
    status!: string;
    @IsArray()
    @ArrayMaxSize(200)
    @ValidateNested({ each: true })
    @Type(() => GrantDto)
    grants!: GrantDto[];
    @IsOptional()
    @IsString()
    @MaxLength(128)
    password?: string;
    @IsOptional()
    @IsString()
    version?: string;
}
class ResetDto {
    @IsString()
    @MaxLength(128)
    password!: string;
    @IsString()
    version!: string;
}
@Controller('api/v1/admin-accounts')
@SetMetadata('SERVER_PROPERTY_SCOPE', true)
@UseGuards(TenantGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER, UserRole.LOCATION_ADMIN, UserRole.SUPERVISOR)
export class AdminAccountsController {
    constructor(private readonly service: AdminAccountsService) { }
    private async safe<T>(run: () => Promise<T>) { try {
        return await run();
    }
    catch (error) {
        if (error instanceof HttpException)
            throw error;
        throw new ServiceUnavailableException('Account administration unavailable. No credentials are returned.');
    } }
    @Get('catalog')
    catalog(
    @Req()
    req: any) { return this.safe(() => this.service.catalog(req.user)); }
    @Get()
    list(
    @Req()
    req: any) { return this.safe(() => this.service.list(req.user)); }
    @Post()
    create(
    @Body()
    data: AccountDto,
    @Req()
    req: any) { return this.safe(() => this.service.save(null, data, req.user)); }
    @Patch(':id')
    update(
    @Param('id', ParseUUIDPipe)
    id: string,
    @Body()
    data: AccountDto,
    @Req()
    req: any) { return this.safe(() => this.service.save(id, data, req.user)); }
    @Post(':id/password')
    reset(
    @Param('id', ParseUUIDPipe)
    id: string,
    @Body()
    data: ResetDto,
    @Req()
    req: any) { return this.safe(() => this.service.reset(id, data.password, data.version, req.user)); }
}

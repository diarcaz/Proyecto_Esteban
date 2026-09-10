import { IsString, IsNotEmpty, MaxLength, IsUUID, IsDateString, IsOptional, IsBoolean, Matches, IsIn, IsEmail } from 'class-validator';
export class AssignmentDto {
  @IsUUID() propertyId: string;
  @IsUUID() departmentId: string;
  @IsUUID() positionId: string;
  @IsDateString() effectiveFrom: string;
  @IsOptional() @IsDateString() effectiveUntil?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}
export class OnboardEmployeeDto extends AssignmentDto {
  @IsString() @IsNotEmpty() @MaxLength(100) firstName: string;
  @IsString() @IsNotEmpty() @MaxLength(100) lastName: string;
  @Matches(/^EMP-[A-Za-z0-9-]{1,40}$/) employeeNumber: string;
  @IsOptional() @IsEmail() email?: string;
  @Matches(/^\d{6}$/) pinCode: string;
  @IsOptional() @IsIn(['WORKER']) role?: 'WORKER';
  @IsOptional() @IsIn(['ACTIVE', 'TERMINATED']) status?: 'ACTIVE' | 'TERMINATED';
}
export class DepartmentDto {
  @IsString() @IsNotEmpty() @MaxLength(100) name: string;
  @IsString() @IsNotEmpty() @MaxLength(40) code: string;
}
export class PositionDto extends DepartmentDto { @IsUUID() departmentId: string; }

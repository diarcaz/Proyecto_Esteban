import { Transform } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsDateString, IsObject, Matches, IsUUID, ValidateIf } from 'class-validator';
import { AttendanceType, AttendanceMethod } from '@domain/entities/attendance-log.entity';

export class StandardClockDto {
  @IsEnum(AttendanceType)
  @IsNotEmpty()
  type!: AttendanceType;

  @IsString()
  @IsNotEmpty()
  location_id!: string;

  @IsEnum(AttendanceMethod)
  @IsNotEmpty()
  method!: AttendanceMethod;

  @IsOptional()
  @IsObject()
  device_info?: Record<string, any>;

  @IsOptional()
  @IsObject()
  location_coordinates?: { latitude: number; longitude: number; accuracy?: number };
}

export class KioskPinDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: 'PIN must contain exactly 6 digits.' })
  pin_code!: string;

  @ValidateIf((o, value) => value !== undefined || o.location_code === undefined)
  @IsUUID()
  property_id?: string;

  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @ValidateIf((o, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  location_code?: string;
}

export class KioskStatusDto extends KioskPinDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @IsNotEmpty()
  employee_number!: string;
}

export class KioskClockDto extends KioskStatusDto {
  @IsEnum(AttendanceType)
  type!: AttendanceType;

  @IsOptional()
  @IsObject()
  device_info?: Record<string, any>;

  @IsOptional()
  @IsObject()
  location_coordinates?: { latitude: number; longitude: number; accuracy?: number };
}

export class PunchQueryDto {
  @IsOptional()
  @IsString()
  location_id?: string;

  @IsOptional()
  @IsDateString()
  start_date?: string;

  @IsOptional()
  @IsDateString()
  end_date?: string;

  @IsOptional()
  @IsString()
  employee_number?: string;
}

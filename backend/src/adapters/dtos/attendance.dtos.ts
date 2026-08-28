import { IsEnum, IsNotEmpty, IsOptional, IsString, IsDateString, IsObject } from 'class-validator';
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

export class KioskClockDto {
  @IsString()
  @IsNotEmpty()
  employee_number!: string;

  @IsString()
  @IsNotEmpty()
  pin_code!: string;

  @IsString()
  @IsNotEmpty()
  location_code!: string;

  @IsEnum(AttendanceType)
  @IsNotEmpty()
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

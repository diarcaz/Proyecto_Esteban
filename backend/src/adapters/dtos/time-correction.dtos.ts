import { IsString, IsNotEmpty, IsOptional, IsDateString, IsEnum } from 'class-validator';

export class CreateTimeCorrectionDto {
  @IsOptional()
  @IsString()
  attendance_log_id?: string;

  @IsOptional()
  @IsString()
  work_shift_id?: string;

  @IsNotEmpty()
  @IsString()
  location_id!: string;

  @IsNotEmpty()
  @IsDateString()
  requested_timestamp!: string;

  @IsNotEmpty()
  @IsString()
  correction_type!: 'MISSED_CLOCK_OUT' | 'INCORRECT_CLOCK_IN' | 'INCORRECT_CLOCK_OUT';

  @IsNotEmpty()
  @IsString()
  reason!: string;
}

export class ReviewTimeCorrectionDto {
  @IsOptional()
  @IsString()
  comments?: string;
}

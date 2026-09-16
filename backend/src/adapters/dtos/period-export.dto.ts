import { IsIn, IsOptional, IsUUID, Matches } from 'class-validator';
export class PeriodExportDto {
  @IsIn(['custom', 'weekly', 'biweekly']) period!: 'custom' | 'weekly' | 'biweekly';
  @Matches(/^\d{4}-\d{2}-\d{2}$/) start_date!: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) end_date?: string;
  @IsOptional() @IsUUID() location_id?: string;
}

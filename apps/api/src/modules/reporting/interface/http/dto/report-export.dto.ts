import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';
import { EXPORT_FORMATS, ExportFormat } from '../../../domain/export-types';
import { PERIOD_TYPES } from '../../../../targets/domain/target-period';

export class ReportExportQuery {
  @ApiProperty({ enum: EXPORT_FORMATS })
  @IsIn([...EXPORT_FORMATS])
  format!: ExportFormat;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ enum: PERIOD_TYPES })
  @IsOptional()
  @IsIn([...PERIOD_TYPES])
  periodType?: (typeof PERIOD_TYPES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  periodStart?: string;
}

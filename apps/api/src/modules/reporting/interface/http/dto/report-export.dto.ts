import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';
import { EXPORT_FORMATS, ExportFormat } from '../../../domain/export-types';
import { PERIOD_TYPES } from '../../../../targets/domain/target-period';

export class ReportExportQuery {
  @ApiProperty({ enum: EXPORT_FORMATS })
  @IsIn([...EXPORT_FORMATS])
  format!: ExportFormat;

  @ApiPropertyOptional({
    description:
      'Range start. leads/follow-ups/quotations/sales/tracks: ISO timestamp, inclusive. ' +
      'performance/analytics/funnel: calendar day YYYY-MM-DD (tenant time zone), inclusive.',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    description:
      'Range end. leads/follow-ups/quotations/sales/tracks: ISO timestamp, exclusive. ' +
      'performance/analytics/funnel: calendar day YYYY-MM-DD (tenant time zone), inclusive.',
  })
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

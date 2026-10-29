import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsUUID, Matches, Max, Min } from 'class-validator';
import { PERIOD_TYPES } from '../../../../targets/domain/target-period';

const YMD_RULE = /^\d{4}-\d{2}-\d{2}$/;

export class PerformanceBoardQuery {
  @ApiPropertyOptional({ enum: PERIOD_TYPES, default: 'monthly' })
  @IsOptional()
  @IsIn([...PERIOD_TYPES])
  periodType?: (typeof PERIOD_TYPES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  periodStart?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  teamId?: string;

  @ApiPropertyOptional({
    description:
      'Inclusive start date, YYYY-MM-DD (tenant time zone). With `from`/`to` the board covers that custom range and periodType/periodStart are ignored.',
  })
  @IsOptional()
  @Matches(YMD_RULE, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  @ApiPropertyOptional({ description: 'Inclusive end date, YYYY-MM-DD (tenant time zone). Defaults to today.' })
  @IsOptional()
  @Matches(YMD_RULE, { message: 'to must be YYYY-MM-DD' })
  to?: string;

  @ApiPropertyOptional({ default: 50, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class PerformanceReportQuery {
  @ApiPropertyOptional({ enum: PERIOD_TYPES, default: 'monthly' })
  @IsOptional()
  @IsIn([...PERIOD_TYPES])
  periodType?: (typeof PERIOD_TYPES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  periodStart?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  teamId?: string;

  @ApiPropertyOptional({
    description:
      'Inclusive start date, YYYY-MM-DD (tenant time zone). With `from`/`to` the board covers that custom range and periodType/periodStart are ignored.',
  })
  @IsOptional()
  @Matches(YMD_RULE, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  @ApiPropertyOptional({ description: 'Inclusive end date, YYYY-MM-DD (tenant time zone). Defaults to today.' })
  @IsOptional()
  @Matches(YMD_RULE, { message: 'to must be YYYY-MM-DD' })
  to?: string;
}

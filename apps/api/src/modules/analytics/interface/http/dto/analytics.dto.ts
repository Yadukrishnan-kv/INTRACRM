import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';

const YMD_RULE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Optional date-range filter for analytics and funnel reports. Both bounds are
 * inclusive calendar dates in the tenant time zone, like the attendance and
 * incentive reports. Omit both to keep the default window (current month).
 */
export class AnalyticsRangeQuery {
  @ApiPropertyOptional({
    description: 'Inclusive start date, YYYY-MM-DD (tenant time zone). Defaults to the first day of the month containing `to`.',
  })
  @IsOptional()
  @Matches(YMD_RULE, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  @ApiPropertyOptional({
    description: 'Inclusive end date, YYYY-MM-DD (tenant time zone). Defaults to today.',
  })
  @IsOptional()
  @Matches(YMD_RULE, { message: 'to must be YYYY-MM-DD' })
  to?: string;
}

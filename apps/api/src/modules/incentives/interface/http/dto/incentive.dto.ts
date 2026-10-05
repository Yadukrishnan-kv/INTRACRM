import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { CursorPageQueryDto } from '../../../../../common/pagination/cursor-page';
import {
  INCENTIVE_BASES,
  PAYOUT_KINDS,
  PAYOUT_STATUSES,
  PLAN_STATUSES,
} from '../../../domain/incentive-engine';
import { PERIOD_TYPES, SCOPE_TYPES } from '../../../../targets/domain/target-period';

const YMD_RULE = /^\d{4}-\d{2}-\d{2}$/;
const BPS_MAX = 1_000_000;

export class IncentivePlanListQuery extends CursorPageQueryDto {
  @ApiPropertyOptional({ enum: PLAN_STATUSES })
  @IsOptional()
  @IsIn([...PLAN_STATUSES])
  status?: (typeof PLAN_STATUSES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  metricCode?: string;
}

export class CreateIncentivePlanRequest {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ default: 'revenue' })
  @IsString()
  @MaxLength(64)
  metricCode!: string;

  @ApiPropertyOptional({ enum: PERIOD_TYPES, default: 'monthly' })
  @IsOptional()
  @IsIn([...PERIOD_TYPES])
  periodType?: (typeof PERIOD_TYPES)[number];

  @ApiPropertyOptional({ enum: SCOPE_TYPES, default: 'membership' })
  @IsOptional()
  @IsIn([...SCOPE_TYPES])
  scopeType?: (typeof SCOPE_TYPES)[number];

  @ApiPropertyOptional({ enum: INCENTIVE_BASES, default: 'revenue' })
  @IsOptional()
  @IsIn([...INCENTIVE_BASES])
  basis?: (typeof INCENTIVE_BASES)[number];

  @ApiPropertyOptional({ enum: PLAN_STATUSES, default: 'draft' })
  @IsOptional()
  @IsIn([...PLAN_STATUSES])
  status?: (typeof PLAN_STATUSES)[number];

  @ApiPropertyOptional({ minimum: 0, maximum: 10000, description: 'Withheld fraction, bps' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  holdBps?: number;

  @ApiPropertyOptional({ minimum: 0, description: 'Nothing is earned below this attainment, bps' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(BPS_MAX)
  minAttainmentBps?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  payoutCap?: number;

  @ApiProperty({ example: '2026-04-01' })
  @Matches(YMD_RULE, { message: 'effectiveFrom must be YYYY-MM-DD' })
  effectiveFrom!: string;

  @ApiPropertyOptional({ example: '2027-03-31' })
  @IsOptional()
  @Matches(YMD_RULE, { message: 'effectiveTo must be YYYY-MM-DD' })
  effectiveTo?: string;
}

export class UpdateIncentivePlanRequest {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ enum: PLAN_STATUSES })
  @IsOptional()
  @IsIn([...PLAN_STATUSES])
  status?: (typeof PLAN_STATUSES)[number];

  @ApiPropertyOptional({ minimum: 0, maximum: 10000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  holdBps?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(BPS_MAX)
  minAttainmentBps?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  payoutCap?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(YMD_RULE, { message: 'effectiveTo must be YYYY-MM-DD' })
  effectiveTo?: string;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version?: number;
}

export class UpsertSlabRequest {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  label?: string;

  @ApiProperty({ minimum: 0, description: 'Inclusive lower bound of the band, bps' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(BPS_MAX)
  fromBps!: number;

  @ApiPropertyOptional({ description: 'Exclusive upper bound, bps. Omit for an open top band.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(BPS_MAX)
  toBps?: number;

  @ApiProperty({ enum: PAYOUT_KINDS })
  @IsIn([...PAYOUT_KINDS])
  payoutKind!: (typeof PAYOUT_KINDS)[number];

  @ApiPropertyOptional({ minimum: 0, description: 'Required when payoutKind is percent' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(BPS_MAX)
  rateBps?: number;

  @ApiPropertyOptional({ minimum: 0, description: 'Required when payoutKind is flat' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount?: number;

  @ApiPropertyOptional({ minimum: 0, description: 'Required when payoutKind is per_unit' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  perUnitAmount?: number;

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  bonusAmount?: number;
}

export class ComputeIncentiveRequest {
  @ApiProperty()
  @IsUUID()
  planId!: string;

  @ApiPropertyOptional({ description: 'Any day inside the period. Defaults to today.' })
  @IsOptional()
  @Matches(YMD_RULE, { message: 'periodStart must be YYYY-MM-DD' })
  periodStart?: string;

  @ApiPropertyOptional({ description: 'Required only when the plan period is custom.' })
  @IsOptional()
  @Matches(YMD_RULE, { message: 'periodEnd must be YYYY-MM-DD' })
  periodEnd?: string;
}

export class IncentiveReportQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  planId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  membershipId?: string;

  @ApiPropertyOptional({ enum: PAYOUT_STATUSES })
  @IsOptional()
  @IsIn([...PAYOUT_STATUSES])
  status?: (typeof PAYOUT_STATUSES)[number];

  @ApiPropertyOptional({ description: 'Inclusive lower bound on the period, YYYY-MM-DD' })
  @IsOptional()
  @Matches(YMD_RULE, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  @ApiPropertyOptional({ description: 'Inclusive upper bound on the period, YYYY-MM-DD' })
  @IsOptional()
  @Matches(YMD_RULE, { message: 'to must be YYYY-MM-DD' })
  to?: string;
}

export class MyIncentiveQuery {
  @ApiPropertyOptional({ description: 'Any day inside the period. Defaults to today.' })
  @IsOptional()
  @Matches(YMD_RULE, { message: 'periodStart must be YYYY-MM-DD' })
  periodStart?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  planId?: string;
}

export class PayoutDecisionRequest {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({ minimum: 0, description: 'Defaults to the payable amount.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  paidAmount?: number;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version?: number;
}

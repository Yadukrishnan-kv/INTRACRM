import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CursorPageQueryDto } from '../../../../../common/pagination/cursor-page';
import { BOARD_PERIODS, BOARD_SCOPES } from '../../../domain/sales-board';
import { PERIOD_TYPES, SCOPE_TYPES } from '../../../domain/target-period';

export class TargetListQuery extends CursorPageQueryDto {
  @ApiPropertyOptional({ enum: PERIOD_TYPES })
  @IsOptional()
  @IsIn([...PERIOD_TYPES])
  periodType?: (typeof PERIOD_TYPES)[number];

  @ApiPropertyOptional({ enum: SCOPE_TYPES })
  @IsOptional()
  @IsIn([...SCOPE_TYPES])
  scopeType?: (typeof SCOPE_TYPES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  teamId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  scopeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  metricCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === 'true' || value === 1 || value === '1') {
      return true;
    }
    if (value === false || value === 'false' || value === 0 || value === '0') {
      return false;
    }
    return undefined;
  })
  @IsBoolean()
  hasProduct?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === 'true' || value === 1 || value === '1') {
      return true;
    }
    if (value === false || value === 'false' || value === 0 || value === '0') {
      return false;
    }
    return undefined;
  })
  @IsBoolean()
  current?: boolean;
}

export class CreateTargetRequest {
  @ApiProperty({ enum: PERIOD_TYPES })
  @IsIn([...PERIOD_TYPES])
  periodType!: (typeof PERIOD_TYPES)[number];

  @ApiProperty({ enum: SCOPE_TYPES })
  @IsIn([...SCOPE_TYPES])
  scopeType!: (typeof SCOPE_TYPES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  scopeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(64)
  metricCode!: string;

  @ApiProperty({ description: 'KPI units. revenue is paise (₹ × 100).' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  targetValue!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  periodStart?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  periodEnd?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateTargetRequest {
  @ApiPropertyOptional({ enum: PERIOD_TYPES })
  @IsOptional()
  @IsIn([...PERIOD_TYPES])
  periodType?: (typeof PERIOD_TYPES)[number];

  @ApiPropertyOptional({ enum: SCOPE_TYPES })
  @IsOptional()
  @IsIn([...SCOPE_TYPES])
  scopeType?: (typeof SCOPE_TYPES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  scopeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  metricCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  targetValue?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  periodStart?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  periodEnd?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version?: number;
}

export class TargetReportQuery {
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

  @ApiPropertyOptional({ enum: SCOPE_TYPES })
  @IsOptional()
  @IsIn([...SCOPE_TYPES])
  scopeType?: (typeof SCOPE_TYPES)[number];
}

export class SalesBoardQuery {
  @ApiPropertyOptional({ enum: BOARD_PERIODS, default: 'this_month' })
  @IsOptional()
  @IsIn([...BOARD_PERIODS])
  period?: (typeof BOARD_PERIODS)[number];

  @ApiPropertyOptional({ enum: BOARD_SCOPES, default: 'tenant' })
  @IsOptional()
  @IsIn([...BOARD_SCOPES])
  scope?: (typeof BOARD_SCOPES)[number];

  @ApiPropertyOptional({ default: 'revenue' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  metricCode?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

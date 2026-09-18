import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CursorPageQueryDto } from '../../../../../common/pagination/cursor-page';
import { wholeQuantity } from '../../../../../common/whole-quantity';
import { QUOTATION_FOLLOW_UP_BUCKETS } from '../../../domain/quotation-follow-up';
import { QUOTATION_STATUSES } from '../../../domain/quotation-types';

export class QuotationItemInput {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(240)
  description!: string;

  @ApiProperty({ default: 1, description: 'Whole units only' })
  @Type(() => Number)
  @Transform(({ value }) => wholeQuantity(value))
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiProperty({ description: 'Unit price in paise' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  unitPriceMinor!: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  discountMinor?: number;

  @ApiPropertyOptional({ default: 0, description: 'Tax in basis points, 1800 = 18%. Ignored when taxRateIds is set.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  taxBps?: number;

  @ApiPropertyOptional({ type: [String], description: 'Managed tax ids from General settings. Combined rate is stored as taxBps.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsUUID('all', { each: true })
  taxRateIds?: string[];
}

export class QuotationListQuery extends CursorPageQueryDto {
  @ApiPropertyOptional({ enum: QUOTATION_STATUSES })
  @IsOptional()
  @IsIn([...QUOTATION_STATUSES])
  status?: (typeof QUOTATION_STATUSES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  leadId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assignedToMembershipId?: string;

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
  pending?: boolean;

  @ApiPropertyOptional({ enum: QUOTATION_FOLLOW_UP_BUCKETS })
  @IsOptional()
  @IsIn([...QUOTATION_FOLLOW_UP_BUCKETS])
  bucket?: (typeof QUOTATION_FOLLOW_UP_BUCKETS)[number];
}

export class CreateQuotationRequest {
  @ApiProperty()
  @IsUUID()
  leadId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  terms?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  validUntilOn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expectedCloseOn?: string;

  @ApiPropertyOptional({ default: 'INR' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assignedToMembershipId?: string;

  @ApiProperty({ type: [QuotationItemInput] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => QuotationItemInput)
  items!: QuotationItemInput[];
}

export class UpdateQuotationRequest {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  terms?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  validUntilOn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expectedCloseOn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assignedToMembershipId?: string;

  @ApiPropertyOptional({ type: [QuotationItemInput] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => QuotationItemInput)
  items?: QuotationItemInput[];

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version?: number;
}

export class SendQuotationBody {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expectedCloseOn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  nextFollowUpAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version?: number;
}

export class ScheduleQuotationFollowUpRequest {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  nextFollowUpAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  remindAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expectedCloseOn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

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
  logged?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version?: number;
}

export class ChangeQuotationStatusRequest {
  @ApiProperty({ enum: QUOTATION_STATUSES })
  @IsIn([...QUOTATION_STATUSES])
  status!: (typeof QUOTATION_STATUSES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version?: number;
}

export class QuotationReportQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assignedToMembershipId?: string;
}

export class SalesReportQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assignedToMembershipId?: string;
}

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
  IsNumber,
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

export const MARGIN_TYPES = ['percent', 'fixed'] as const;
export type MarginType = (typeof MARGIN_TYPES)[number];

export class QuotationItemInput {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(1000)
  description!: string;

  @ApiProperty({ default: 1, description: 'Whole units only' })
  @Type(() => Number)
  @Transform(({ value }) => wholeQuantity(value))
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiPropertyOptional({ description: 'Selling unit price before GST, in paise' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  unitPriceMinor?: number;

  @ApiPropertyOptional({ description: 'Item code shown on the quotation, e.g. KW2' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  itemCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  width?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  height?: number;

  @ApiPropertyOptional({ default: 'Nos' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;

  @ApiPropertyOptional({ description: 'Vendor quoted unit price in paise (internal cost).' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  vendorPriceMinor?: number;

  @ApiPropertyOptional({ enum: MARGIN_TYPES })
  @IsOptional()
  @IsIn([...MARGIN_TYPES])
  marginType?: MarginType;

  @ApiPropertyOptional({ description: 'Margin: basis points when percent (2000 = 20%), paise per unit when fixed.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  marginValue?: number;

  @ApiPropertyOptional({ deprecated: true, description: 'Ignored. Discounts are applied to the quotation total.' })
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

export class QuotationChargeInput {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  description!: string;

  @ApiProperty({ description: 'Charge before GST, in paise' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  amountMinor!: number;

  @ApiPropertyOptional({ description: 'GST in basis points; defaults to the tenant default GST.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  taxBps?: number;
}

export class QuotationSpecRow {
  @ApiProperty()
  @IsString()
  @MaxLength(80)
  label!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(160)
  value!: string;
}

export class UpdateQuotationSettingsRequest {
  @ApiPropertyOptional({ description: 'Default GST for quotations in basis points, 1800 = 18%' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  defaultGstBps?: number;

  @ApiPropertyOptional({ description: 'Unit prices round up to a multiple of this many paise (0 = off)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  roundingStepMinor?: number;

  @ApiPropertyOptional({ description: 'Logo as a data URL (PNG/JPEG), empty string removes it' })
  @IsOptional()
  @IsString()
  @MaxLength(700_000)
  logoDataUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  companyName?: string;

  @ApiPropertyOptional({ description: 'Footer address / contact line' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional({ description: 'Bank and UPI details, one per line' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  bankDetails?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  defaultTerms?: string;

  @ApiPropertyOptional({ type: [QuotationSpecRow] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => QuotationSpecRow)
  defaultSpecs?: QuotationSpecRow[];
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

  @ApiPropertyOptional({ description: 'Total discount before GST, in paise' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  discountMinor?: number;

  @ApiPropertyOptional({ type: [QuotationChargeInput], description: 'Additional billing charges' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => QuotationChargeInput)
  charges?: QuotationChargeInput[];

  @ApiPropertyOptional({ description: 'Prices already include GST (default true for new quotations)' })
  @IsOptional()
  @IsBoolean()
  gstInclusive?: boolean;

  @ApiPropertyOptional({ type: [QuotationSpecRow], description: 'Product specification rows' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => QuotationSpecRow)
  specs?: QuotationSpecRow[];
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

  @ApiPropertyOptional({ description: 'Total discount before GST, in paise' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  discountMinor?: number;

  @ApiPropertyOptional({ type: [QuotationChargeInput], description: 'Additional billing charges' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => QuotationChargeInput)
  charges?: QuotationChargeInput[];

  @ApiPropertyOptional({ description: 'Prices already include GST (default true for new quotations)' })
  @IsOptional()
  @IsBoolean()
  gstInclusive?: boolean;

  @ApiPropertyOptional({ type: [QuotationSpecRow], description: 'Product specification rows' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => QuotationSpecRow)
  specs?: QuotationSpecRow[];

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

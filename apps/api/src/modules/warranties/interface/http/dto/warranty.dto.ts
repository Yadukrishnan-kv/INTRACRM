import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CursorPageQueryDto } from '../../../../../common/pagination/cursor-page';
import { wholeQuantity } from '../../../../../common/whole-quantity';
import { WARRANTY_STATUSES, WRITABLE_WARRANTY_STATUSES } from '../../../domain/warranty-types';

export class WarrantyItemInput {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(240)
  description!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  serialNumber?: string;

  @ApiProperty({ default: 1, description: 'Whole units only' })
  @Type(() => Number)
  @Transform(({ value }) => wholeQuantity(value))
  @IsInt()
  @Min(1)
  quantity!: number;
}

export class WarrantyListQuery extends CursorPageQueryDto {
  @ApiPropertyOptional({ enum: WARRANTY_STATUSES })
  @IsOptional()
  @IsIn([...WARRANTY_STATUSES])
  status?: (typeof WARRANTY_STATUSES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  leadId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  quotationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;
}

export class CreateWarrantyRequest {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  leadId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  quotationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  serialNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  purchasedOn?: string;

  @ApiProperty()
  @IsDateString()
  warrantyStartOn!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  warrantyEndOn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  coverageNotes?: string;

  @ApiProperty({ type: [WarrantyItemInput] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => WarrantyItemInput)
  items!: WarrantyItemInput[];
}

export class UpdateWarrantyRequest {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  version!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  serialNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  purchasedOn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  warrantyStartOn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  warrantyEndOn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  coverageNotes?: string;

  @ApiPropertyOptional({ type: [WarrantyItemInput] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => WarrantyItemInput)
  items?: WarrantyItemInput[];
}

export class ChangeWarrantyStatusRequest {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  version!: number;

  @ApiProperty({ enum: WRITABLE_WARRANTY_STATUSES })
  @IsIn([...WRITABLE_WARRANTY_STATUSES])
  status!: (typeof WRITABLE_WARRANTY_STATUSES)[number];
}

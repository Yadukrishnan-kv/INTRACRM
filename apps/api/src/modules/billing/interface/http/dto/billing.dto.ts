import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BILLING_WEBHOOK_EVENTS } from '../../../domain/billing';

export class BillingWebhookCustomer {
  @ApiProperty()
  @IsString()
  @MaxLength(160)
  externalId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  displayName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phoneE164?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(254)
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;
}

export class BillingWebhookInvoice {
  @ApiProperty()
  @IsString()
  @MaxLength(160)
  externalId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  invoiceNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  totalMinor?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  balanceMinor?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;
}

export class BillingWebhookPayment {
  @ApiProperty()
  @IsString()
  @MaxLength(160)
  invoiceExternalId!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(160)
  paymentExternalId!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  amountMinor!: number;

  @ApiProperty()
  @IsString()
  @MaxLength(3)
  currency!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(10)
  paidOn!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  method?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  status?: string;
}

export class BillingWebhookRequest {
  @ApiProperty({ enum: BILLING_WEBHOOK_EVENTS })
  @IsIn([...BILLING_WEBHOOK_EVENTS])
  event!: (typeof BILLING_WEBHOOK_EVENTS)[number];

  @ApiProperty()
  @IsUUID()
  tenantId!: string;

  @ApiPropertyOptional({ type: BillingWebhookCustomer })
  @IsOptional()
  @ValidateNested()
  @Type(() => BillingWebhookCustomer)
  customer?: BillingWebhookCustomer;

  @ApiPropertyOptional({ type: BillingWebhookInvoice })
  @IsOptional()
  @ValidateNested()
  @Type(() => BillingWebhookInvoice)
  invoice?: BillingWebhookInvoice;

  @ApiPropertyOptional({ type: BillingWebhookPayment })
  @IsOptional()
  @ValidateNested()
  @Type(() => BillingWebhookPayment)
  payment?: BillingWebhookPayment;
}

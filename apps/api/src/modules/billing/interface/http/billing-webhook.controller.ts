import { Body, Controller, Headers, Param, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Public } from '../../../../common/auth/public.decorator';
import { BillingService } from '../../application/billing.service';
import { BillingWebhookRequest } from './dto/billing.dto';

type RawRequest = Request & { rawBody?: Buffer };

@ApiTags('billing')
@Public()
@Controller('integrations/billing')
export class BillingWebhookController {
  constructor(private readonly billing: BillingService) {}

  @Post('webhooks/:provider')
  handle(
    @Param('provider') provider: string,
    @Headers('x-billing-signature') signature: string | undefined,
    @Body() dto: BillingWebhookRequest,
    @Req() request: RawRequest,
  ) {
    return this.billing.handleWebhook({
      provider: provider.trim().toLowerCase() || 'http',
      rawBody: request.rawBody ?? JSON.stringify(dto),
      signature,
      event: dto.event,
      tenantId: dto.tenantId,
      ...(dto.customer ? { customer: dto.customer } : {}),
      ...(dto.invoice ? { invoice: dto.invoice } : {}),
      ...(dto.payment
        ? {
            payment: {
              invoiceExternalId: dto.payment.invoiceExternalId,
              paymentExternalId: dto.payment.paymentExternalId,
              amountMinor: dto.payment.amountMinor,
              currency: dto.payment.currency,
              paidOn: dto.payment.paidOn,
              method: dto.payment.method ?? null,
              status: dto.payment.status ?? null,
            },
          }
        : {}),
    });
  }
}

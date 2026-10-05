import { Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../../../common/auth/current-user.decorator';
import { RequirePermissions } from '../../../../common/auth/require-permissions.decorator';
import { PERMISSION } from '../../../identity/domain/system-roles';
import { BillingService } from '../../application/billing.service';

@ApiTags('billing')
@ApiBearerAuth()
@Controller()
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('billing/capabilities')
  @RequirePermissions(PERMISSION.billingRead)
  capabilities() {
    return this.billing.capabilities();
  }

  @Get('leads/:leadId/billing')
  @RequirePermissions(PERMISSION.billingRead)
  snapshot(@CurrentUser() actor: AuthUser, @Param('leadId', ParseUUIDPipe) leadId: string) {
    return this.billing.snapshot(actor, leadId);
  }

  @Post('leads/:leadId/billing/customers/sync')
  @RequirePermissions(PERMISSION.billingSync)
  syncCustomer(@CurrentUser() actor: AuthUser, @Param('leadId', ParseUUIDPipe) leadId: string) {
    return this.billing.syncCustomer(actor, leadId);
  }

  @Post('quotations/:quotationId/billing/invoices/sync')
  @RequirePermissions(PERMISSION.billingSync)
  syncInvoice(
    @CurrentUser() actor: AuthUser,
    @Param('quotationId', ParseUUIDPipe) quotationId: string,
  ) {
    return this.billing.syncInvoice(actor, quotationId);
  }

  @Post('billing/invoices/:invoiceId/payments/refresh')
  @RequirePermissions(PERMISSION.billingSync)
  refreshPayment(
    @CurrentUser() actor: AuthUser,
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
  ) {
    return this.billing.refreshPayment(actor, invoiceId);
  }
}

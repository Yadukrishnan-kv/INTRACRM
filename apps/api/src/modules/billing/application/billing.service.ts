import { HttpStatus, Injectable } from '@nestjs/common';
import { AuthUser } from '../../../common/auth/current-user.decorator';
import { AppException } from '../../../common/exceptions/app.exception';
import { ErrorCodes } from '../../../common/exceptions/error-codes';
import { PinoLogger } from '../../../common/logging/pino-logger';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  BILLING_WEBHOOK_EVENT,
  BillingWebhookEvent,
  PaymentDraft,
  verifyHmacSha256,
} from '../domain/billing';
import { BillingGateway } from './billing.gateway';
import { CustomerSyncService } from './customer-sync.service';
import { InvoiceSyncService } from './invoice-sync.service';
import { PaymentStatusService } from './payment-status.service';

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: BillingGateway,
    private readonly customers: CustomerSyncService,
    private readonly invoices: InvoiceSyncService,
    private readonly payments: PaymentStatusService,
    private readonly logger: PinoLogger,
  ) {}

  capabilities() {
    return this.gateway.capabilities();
  }

  async snapshot(actor: AuthUser, leadId: string) {
    const tenantId = this.requireTenant(actor);
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!lead) {
      throw new AppException(HttpStatus.NOT_FOUND, 'Lead not found', { code: ErrorCodes.NOT_FOUND });
    }
    const customer = await this.prisma.billingCustomer.findFirst({
      where: { tenantId, leadId, deletedAt: null },
    });
    const invoices = await this.prisma.billingInvoice.findMany({
      where: { tenantId, leadId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: {
        payments: { where: { deletedAt: null }, orderBy: { paidOn: 'desc' } },
      },
    });
    return {
      customer: customer ? this.customers.toView(customer) : null,
      invoices: invoices.map((invoice) => ({
        ...this.invoices.toView(invoice),
        payments: invoice.payments.map((payment) => this.payments.toPaymentView(payment)),
      })),
    };
  }

  syncCustomer(actor: AuthUser, leadId: string) {
    return this.customers.syncLead(actor, leadId);
  }

  syncInvoice(actor: AuthUser, quotationId: string) {
    return this.invoices.syncQuotation(actor, quotationId);
  }

  refreshPayment(actor: AuthUser, invoiceId: string) {
    return this.payments.refreshInvoice(actor, invoiceId);
  }

  async syncWonQuotation(actor: AuthUser, quotationId: string) {
    try {
      const invoice = await this.invoices.syncQuotation(actor, quotationId);
      return { invoice, warning: invoice.warning };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Billing sync failed';
      this.logger.warn(`Won quotation billing sync failed: ${message}`);
      return { invoice: null, warning: message };
    }
  }

  async handleWebhook(input: {
    provider: string;
    rawBody: Buffer | string;
    signature: string | undefined;
    event: BillingWebhookEvent;
    tenantId: string;
    customer?: { externalId: string; displayName?: string; phoneE164?: string; email?: string; city?: string };
    invoice?: {
      externalId: string;
      invoiceNumber?: string;
      status?: string;
      totalMinor?: number;
      balanceMinor?: number;
      currency?: string;
    };
    payment?: PaymentDraft;
  }) {
    const secret = this.gateway.webhookSecret();
    if (!secret || !verifyHmacSha256(input.rawBody, secret, input.signature)) {
      throw new AppException(HttpStatus.UNAUTHORIZED, 'Invalid billing webhook signature', {
        code: ErrorCodes.UNAUTHORIZED,
      });
    }
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: input.tenantId, deletedAt: null },
    });
    if (!tenant) {
      throw new AppException(HttpStatus.NOT_FOUND, 'Tenant not found', { code: ErrorCodes.NOT_FOUND });
    }
    const actor = await this.actorForTenant(tenant.id);
    if (input.event === BILLING_WEBHOOK_EVENT.customerUpserted && input.customer) {
      const row = await this.prisma.billingCustomer.findFirst({
        where: { tenantId: tenant.id, externalId: input.customer.externalId, deletedAt: null },
      });
      if (!row) {
        throw new AppException(HttpStatus.NOT_FOUND, 'Billing customer not found', { code: ErrorCodes.NOT_FOUND });
      }
      const updated = await this.prisma.billingCustomer.update({
        where: { id: row.id },
        data: {
          displayName: input.customer.displayName?.trim() || row.displayName,
          phoneE164: input.customer.phoneE164 ?? row.phoneE164,
          email: input.customer.email ?? row.email,
          city: input.customer.city ?? row.city,
          provider: input.provider,
          syncStatus: 'synced',
          lastSyncedAt: new Date(),
          lastError: null,
          version: { increment: 1 },
        },
      });
      return { accepted: true, customer: this.customers.toView(updated) };
    }
    if (input.event === BILLING_WEBHOOK_EVENT.invoiceUpserted && input.invoice) {
      const row = await this.prisma.billingInvoice.findFirst({
        where: { tenantId: tenant.id, externalId: input.invoice.externalId, deletedAt: null },
      });
      if (!row) {
        throw new AppException(HttpStatus.NOT_FOUND, 'Invoice not found', { code: ErrorCodes.NOT_FOUND });
      }
      return {
        accepted: true,
        invoice: await this.payments.refreshInvoice(actor, row.id).catch(async () => {
          const updated = await this.prisma.billingInvoice.update({
            where: { id: row.id },
            data: {
              invoiceNumber: input.invoice!.invoiceNumber ?? row.invoiceNumber,
              status: input.invoice!.status ?? row.status,
              totalMinor:
                input.invoice!.totalMinor == null ? row.totalMinor : BigInt(input.invoice!.totalMinor),
              balanceMinor:
                input.invoice!.balanceMinor == null ? row.balanceMinor : BigInt(input.invoice!.balanceMinor),
              currency: input.invoice!.currency ?? row.currency,
              syncStatus: 'synced',
              lastSyncedAt: new Date(),
              lastError: null,
              updatedBy: actor.membershipId ? actor.userId : null,
              version: { increment: 1 },
            },
          });
          return this.invoices.toView(updated);
        }),
      };
    }
    if (input.event === BILLING_WEBHOOK_EVENT.paymentRecorded && input.payment) {
      return {
        accepted: true,
        invoice: await this.payments.applyInbound(actor, input.payment),
      };
    }
    throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, 'Unsupported billing webhook event', {
      code: ErrorCodes.VALIDATION_ERROR,
    });
  }

  private async actorForTenant(tenantId: string): Promise<AuthUser> {
    const membership = await this.prisma.membership.findFirst({
      where: { tenantId, deletedAt: null, status: 'active' },
      orderBy: { createdAt: 'asc' },
    });
    return {
      userId: membership?.userId ?? tenantId,
      sessionId: 'billing-webhook',
      tenantId,
      ...(membership?.id ? { membershipId: membership.id } : {}),
    };
  }

  private requireTenant(actor: AuthUser): string {
    if (!actor.tenantId) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'Tenant required', {
        code: ErrorCodes.TENANT_REQUIRED,
      });
    }
    return actor.tenantId;
  }
}

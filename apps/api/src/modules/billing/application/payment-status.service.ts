import { HttpStatus, Injectable } from '@nestjs/common';
import { AuthUser } from '../../../common/auth/current-user.decorator';
import { AppException } from '../../../common/exceptions/app.exception';
import { ErrorCodes } from '../../../common/exceptions/error-codes';
import { PrismaService } from '../../../prisma/prisma.service';
import { TIMELINE_EVENT } from '../../activities/domain/timeline-events';
import { TimelineWriter } from '../../activities/application/timeline.writer';
import {
  applyPaymentBalance,
  BILLING_DIRECTION,
  BILLING_RESOURCE,
  derivePaymentStatus,
  PAYMENT_STATUS,
  PaymentDraft,
  SYNC_STATUS,
} from '../domain/billing';
import { BillingGateway } from './billing.gateway';
import { InvoiceSyncService } from './invoice-sync.service';

@Injectable()
export class PaymentStatusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: BillingGateway,
    private readonly invoices: InvoiceSyncService,
    private readonly timeline: TimelineWriter,
  ) {}

  async refreshInvoice(actor: AuthUser, invoiceId: string) {
    const tenantId = this.requireTenant(actor);
    const invoice = await this.prisma.billingInvoice.findFirst({
      where: { id: invoiceId, tenantId, deletedAt: null },
    });
    if (!invoice) {
      throw new AppException(HttpStatus.NOT_FOUND, 'Invoice not found', { code: ErrorCodes.NOT_FOUND });
    }
    const pulled = await this.gateway.fetchPayments(invoice.externalId);
    if (!pulled.ok) {
      await this.prisma.billingInvoice.update({
        where: { id: invoice.id },
        data: {
          syncStatus: SYNC_STATUS.failed,
          lastError: pulled.error,
          updatedBy: actor.membershipId ? actor.userId : null,
          version: { increment: 1 },
        },
      });
      throw new AppException(HttpStatus.SERVICE_UNAVAILABLE, pulled.error ?? 'Billing gateway unreachable', {
        code: ErrorCodes.SERVICE_UNAVAILABLE,
      });
    }
    for (const payment of pulled.payments) {
      if (!payment.externalId || !payment.paidOn) {
        continue;
      }
      await this.recordPayment(actor, invoice.id, {
        invoiceExternalId: invoice.externalId,
        paymentExternalId: payment.externalId,
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        paidOn: payment.paidOn,
        method: payment.method,
        status: payment.status,
      });
    }
    const paid = await this.paidTotal(invoice.id);
    const totalMinor = pulled.invoice?.totalMinor ?? Number(invoice.totalMinor);
    const balanceMinor = pulled.invoice?.balanceMinor ?? applyPaymentBalance(totalMinor, paid);
    const invoiceStatus = pulled.invoice?.status ?? invoice.status;
    return this.recalculate(actor, invoice.id, {
      invoiceStatus,
      totalMinor,
      balanceMinor,
    });
  }

  async applyInbound(actor: AuthUser, draft: PaymentDraft) {
    const tenantId = this.requireTenant(actor);
    const invoice = await this.prisma.billingInvoice.findFirst({
      where: { tenantId, externalId: draft.invoiceExternalId, deletedAt: null },
    });
    if (!invoice) {
      throw new AppException(HttpStatus.NOT_FOUND, 'Invoice not found for payment', {
        code: ErrorCodes.NOT_FOUND,
      });
    }
    await this.recordPayment(actor, invoice.id, draft);
    const paid = await this.paidTotal(invoice.id);
    return this.recalculate(actor, invoice.id, {
      invoiceStatus: invoice.status,
      totalMinor: Number(invoice.totalMinor),
      balanceMinor: applyPaymentBalance(Number(invoice.totalMinor), paid),
    });
  }

  toPaymentView(row: {
    id: string;
    invoiceId: string;
    provider: string;
    externalId: string;
    amountMinor: bigint;
    currency: string;
    method: string | null;
    status: string | null;
    paidOn: Date;
    receivedAt: Date;
  }) {
    return {
      id: row.id,
      invoiceId: row.invoiceId,
      provider: row.provider,
      externalId: row.externalId,
      amountMinor: Number(row.amountMinor),
      currency: row.currency,
      method: row.method,
      status: row.status,
      paidOn: row.paidOn.toISOString().slice(0, 10),
      receivedAt: row.receivedAt.toISOString(),
    };
  }

  private async recordPayment(actor: AuthUser, invoiceId: string, draft: PaymentDraft) {
    const tenantId = this.requireTenant(actor);
    const invoice = await this.prisma.billingInvoice.findFirst({
      where: { id: invoiceId, tenantId, deletedAt: null },
    });
    if (!invoice) {
      throw new AppException(HttpStatus.NOT_FOUND, 'Invoice not found', { code: ErrorCodes.NOT_FOUND });
    }
    const existing = await this.prisma.billingPayment.findFirst({
      where: {
        tenantId,
        provider: invoice.provider,
        externalId: draft.paymentExternalId,
        deletedAt: null,
      },
    });
    if (existing) {
      return existing;
    }
    const created = await this.prisma.billingPayment.create({
      data: {
        tenantId,
        invoiceId,
        provider: invoice.provider,
        externalId: draft.paymentExternalId,
        amountMinor: BigInt(draft.amountMinor),
        currency: draft.currency,
        method: draft.method,
        status: draft.status,
        paidOn: new Date(`${draft.paidOn}T00:00:00.000Z`),
        createdBy: actor.membershipId ? actor.userId : null,
        updatedBy: actor.membershipId ? actor.userId : null,
      },
    });
    await this.prisma.billingSyncJob.create({
      data: {
        tenantId,
        resource: BILLING_RESOURCE.payment,
        direction: BILLING_DIRECTION.inbound,
        provider: invoice.provider,
        localId: created.id,
        externalId: created.externalId,
        status: SYNC_STATUS.synced,
      },
    });
    if (actor.membershipId) {
      await this.timeline.record({
        tenantId,
        leadId: invoice.leadId,
        actor,
        eventCode: TIMELINE_EVENT.paymentReceived,
        subject: 'Payment received',
        body: `${draft.currency} ${(draft.amountMinor / 100).toFixed(2)}`,
        metadata: { invoiceId, externalId: draft.paymentExternalId, amountMinor: draft.amountMinor },
      });
    }
    return created;
  }

  private async recalculate(
    actor: AuthUser,
    invoiceId: string,
    snapshot: { invoiceStatus: string; totalMinor: number; balanceMinor: number },
  ) {
    const invoice = await this.prisma.billingInvoice.findFirstOrThrow({ where: { id: invoiceId } });
    const paymentStatus = derivePaymentStatus({
      invoiceStatus: snapshot.invoiceStatus,
      totalMinor: snapshot.totalMinor,
      balanceMinor: snapshot.balanceMinor,
      dueOn: invoice.dueOn,
    });
    const updated = await this.prisma.billingInvoice.update({
      where: { id: invoice.id },
      data: {
        status: snapshot.invoiceStatus,
        paymentStatus,
        totalMinor: BigInt(snapshot.totalMinor),
        balanceMinor: BigInt(snapshot.balanceMinor),
        paidAt: paymentStatus === PAYMENT_STATUS.paid ? invoice.paidAt ?? new Date() : invoice.paidAt,
        syncStatus: SYNC_STATUS.synced,
        lastSyncedAt: new Date(),
        lastError: null,
        updatedBy: actor.membershipId ? actor.userId : null,
        version: { increment: 1 },
      },
    });
    return this.invoices.toView(updated);
  }

  private async paidTotal(invoiceId: string): Promise<number> {
    const payments = await this.prisma.billingPayment.findMany({
      where: { invoiceId, deletedAt: null },
      select: { amountMinor: true },
    });
    return payments.reduce((sum, row) => sum + Number(row.amountMinor), 0);
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

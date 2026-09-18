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
  InvoiceDraft,
  PAYMENT_STATUS,
  SYNC_STATUS,
} from '../domain/billing';
import { BillingGateway } from './billing.gateway';
import { CustomerSyncService } from './customer-sync.service';

@Injectable()
export class InvoiceSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: BillingGateway,
    private readonly customers: CustomerSyncService,
    private readonly timeline: TimelineWriter,
  ) {}

  async syncQuotation(actor: AuthUser, quotationId: string, options?: { quiet?: boolean }) {
    const tenantId = this.requireTenant(actor);
    const quotation = await this.prisma.quotation.findFirst({
      where: { id: quotationId, tenantId, deletedAt: null },
      include: {
        items: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!quotation) {
      throw new AppException(HttpStatus.NOT_FOUND, 'Quotation not found', { code: ErrorCodes.NOT_FOUND });
    }
    if (quotation.status !== 'won') {
      throw new AppException(HttpStatus.CONFLICT, 'Invoice sync requires a won quotation', {
        code: ErrorCodes.CONFLICT,
      });
    }
    const customer = await this.customers.syncLead(actor, quotation.leadId, { quiet: true });
    const customerRow = await this.prisma.billingCustomer.findFirst({
      where: { id: customer.id, tenantId, deletedAt: null },
    });
    if (!customerRow) {
      throw new AppException(HttpStatus.NOT_FOUND, 'Billing customer not found', { code: ErrorCodes.NOT_FOUND });
    }
    const totalMinor = Number(quotation.totalMinor);
    const draft: InvoiceDraft = {
      quotationId: quotation.id,
      quotationNumber: quotation.quotationNumber,
      customerExternalId: customerRow.externalId,
      currency: quotation.currency,
      totalMinor,
      issuedOn: (quotation.wonAt ?? new Date()).toISOString().slice(0, 10),
      dueOn: quotation.expectedCloseOn ? quotation.expectedCloseOn.toISOString().slice(0, 10) : null,
      lines: quotation.items.map((item) => ({
        description: item.description,
        quantity: String(item.quantity),
        unitPriceMinor: Number(item.unitPriceMinor),
        lineTotalMinor: Number(item.lineTotalMinor),
      })),
    };
    const result = await this.gateway.upsertInvoice(draft);
    const existing =
      (await this.prisma.billingInvoice.findFirst({
        where: { tenantId, quotationId: quotation.id, deletedAt: null },
      })) ??
      (await this.prisma.billingInvoice.findFirst({
        where: { tenantId, provider: result.provider, externalId: result.externalId, deletedAt: null },
      }));
    const paid = existing
      ? await this.paidTotal(existing.id)
      : 0;
    const balanceMinor = applyPaymentBalance(result.balanceMinor, existing ? paid : 0);
    const paymentStatus = derivePaymentStatus({
      invoiceStatus: result.status,
      totalMinor: result.totalMinor,
      balanceMinor,
      dueOn: draft.dueOn,
    });
    const status = result.ok ? SYNC_STATUS.synced : SYNC_STATUS.failed;
    const row = existing
      ? await this.prisma.billingInvoice.update({
          where: { id: existing.id },
          data: {
            billingCustomerId: customerRow.id,
            provider: result.provider,
            externalId: result.externalId,
            invoiceNumber: result.invoiceNumber,
            status: result.status,
            paymentStatus,
            currency: quotation.currency,
            totalMinor: BigInt(result.totalMinor),
            balanceMinor: BigInt(balanceMinor),
            issuedOn: new Date(`${draft.issuedOn}T00:00:00.000Z`),
            dueOn: draft.dueOn ? new Date(`${draft.dueOn}T00:00:00.000Z`) : null,
            paidAt: paymentStatus === PAYMENT_STATUS.paid ? existing.paidAt ?? new Date() : null,
            syncStatus: status,
            lastSyncedAt: result.ok ? new Date() : existing.lastSyncedAt,
            lastError: result.error,
            updatedBy: actor.userId,
            version: { increment: 1 },
          },
        })
      : await this.prisma.billingInvoice.create({
          data: {
            tenantId,
            leadId: quotation.leadId,
            quotationId: quotation.id,
            billingCustomerId: customerRow.id,
            provider: result.provider,
            externalId: result.externalId,
            invoiceNumber: result.invoiceNumber,
            status: result.status,
            paymentStatus,
            currency: quotation.currency,
            totalMinor: BigInt(result.totalMinor),
            balanceMinor: BigInt(result.balanceMinor),
            issuedOn: new Date(`${draft.issuedOn}T00:00:00.000Z`),
            dueOn: draft.dueOn ? new Date(`${draft.dueOn}T00:00:00.000Z`) : null,
            syncStatus: status,
            lastSyncedAt: result.ok ? new Date() : null,
            lastError: result.error,
            createdBy: actor.userId,
            updatedBy: actor.userId,
          },
        });
    await this.prisma.billingSyncJob.create({
      data: {
        tenantId,
        resource: BILLING_RESOURCE.invoice,
        direction: BILLING_DIRECTION.outbound,
        provider: result.provider,
        localId: row.id,
        externalId: row.externalId,
        status,
        error: result.error,
      },
    });
    if (result.ok && !options?.quiet) {
      await this.timeline.record({
        tenantId,
        leadId: quotation.leadId,
        actor,
        eventCode: TIMELINE_EVENT.invoiceSynced,
        subject: 'Invoice synced',
        body: row.invoiceNumber,
        metadata: { provider: row.provider, externalId: row.externalId, paymentStatus: row.paymentStatus },
      });
    }
    return this.toView(row);
  }

  toView(row: {
    id: string;
    leadId: string;
    quotationId: string | null;
    provider: string;
    externalId: string;
    invoiceNumber: string;
    status: string;
    paymentStatus: string;
    currency: string;
    totalMinor: bigint;
    balanceMinor: bigint;
    issuedOn: Date | null;
    dueOn: Date | null;
    paidAt: Date | null;
    syncStatus: string;
    lastSyncedAt: Date | null;
    lastError: string | null;
  }) {
    return {
      id: row.id,
      leadId: row.leadId,
      quotationId: row.quotationId,
      provider: row.provider,
      externalId: row.externalId,
      invoiceNumber: row.invoiceNumber,
      status: row.status,
      paymentStatus: row.paymentStatus,
      currency: row.currency,
      totalMinor: Number(row.totalMinor),
      balanceMinor: Number(row.balanceMinor),
      issuedOn: row.issuedOn?.toISOString().slice(0, 10) ?? null,
      dueOn: row.dueOn?.toISOString().slice(0, 10) ?? null,
      paidAt: row.paidAt?.toISOString() ?? null,
      syncStatus: row.syncStatus,
      lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
      warning: row.lastError,
    };
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

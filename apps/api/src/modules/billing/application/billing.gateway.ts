import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../../common/config/configuration';
import { PinoLogger } from '../../../common/logging/pino-logger';
import {
  CustomerDraft,
  InvoiceDraft,
  INVOICE_STATUS,
  localCustomerExternalId,
  localInvoiceExternalId,
  localInvoiceNumber,
} from '../domain/billing';

export type GatewayCustomerResult = {
  ok: boolean;
  provider: string;
  externalId: string;
  error: string | null;
};

export type GatewayInvoiceResult = {
  ok: boolean;
  provider: string;
  externalId: string;
  invoiceNumber: string;
  status: string;
  totalMinor: number;
  balanceMinor: number;
  error: string | null;
};

export type GatewayPaymentResult = {
  ok: boolean;
  payments: Array<{
    externalId: string;
    amountMinor: number;
    currency: string;
    paidOn: string;
    method: string | null;
    status: string | null;
  }>;
  invoice: {
    status: string;
    totalMinor: number;
    balanceMinor: number;
  } | null;
  error: string | null;
};

const TIMEOUT_MS = 8000;

@Injectable()
export class BillingGateway {
  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly logger: PinoLogger,
  ) {}

  capabilities() {
    return {
      provider: this.provider(),
      mode: this.canHttp() ? 'gateway' : 'manual',
      webhook: this.webhookSecret() != null,
    };
  }

  provider(): string {
    return this.canHttp() ? 'http' : 'manual';
  }

  webhookSecret(): string | null {
    return this.config.get('billing', { infer: true }).webhookSecret;
  }

  async upsertCustomer(draft: CustomerDraft): Promise<GatewayCustomerResult> {
    if (!this.canHttp()) {
      return {
        ok: true,
        provider: 'manual',
        externalId: localCustomerExternalId(draft.leadNumber),
        error: null,
      };
    }
    const result = await this.httpJson('POST', '/customers', {
      externalId: localCustomerExternalId(draft.leadNumber),
      displayName: draft.displayName,
      phoneE164: draft.phoneE164,
      email: draft.email,
      city: draft.city,
      leadNumber: draft.leadNumber,
    });
    if (!result.ok) {
      this.logger.warn(`Billing customer push failed; keeping local mapping: ${result.error}`);
      return {
        ok: false,
        provider: 'http',
        externalId: localCustomerExternalId(draft.leadNumber),
        error: result.error,
      };
    }
    return {
      ok: true,
      provider: 'http',
      externalId: String(result.json.externalId ?? localCustomerExternalId(draft.leadNumber)),
      error: null,
    };
  }

  async upsertInvoice(draft: InvoiceDraft): Promise<GatewayInvoiceResult> {
    const localId = localInvoiceExternalId(draft.quotationNumber);
    const invoiceNumber = localInvoiceNumber(draft.quotationNumber);
    if (!this.canHttp()) {
      return {
        ok: true,
        provider: 'manual',
        externalId: localId,
        invoiceNumber,
        status: INVOICE_STATUS.issued,
        totalMinor: draft.totalMinor,
        balanceMinor: draft.totalMinor,
        error: null,
      };
    }
    const result = await this.httpJson('POST', '/invoices', {
      externalId: localId,
      invoiceNumber,
      customerExternalId: draft.customerExternalId,
      quotationNumber: draft.quotationNumber,
      currency: draft.currency,
      totalMinor: draft.totalMinor,
      issuedOn: draft.issuedOn,
      dueOn: draft.dueOn,
      lines: draft.lines,
    });
    if (!result.ok) {
      this.logger.warn(`Billing invoice push failed; keeping local invoice: ${result.error}`);
      return {
        ok: false,
        provider: 'http',
        externalId: localId,
        invoiceNumber,
        status: INVOICE_STATUS.issued,
        totalMinor: draft.totalMinor,
        balanceMinor: draft.totalMinor,
        error: result.error,
      };
    }
    return {
      ok: true,
      provider: 'http',
      externalId: String(result.json.externalId ?? localId),
      invoiceNumber: String(result.json.invoiceNumber ?? invoiceNumber),
      status: String(result.json.status ?? INVOICE_STATUS.issued),
      totalMinor: Number(result.json.totalMinor ?? draft.totalMinor),
      balanceMinor: Number(result.json.balanceMinor ?? draft.totalMinor),
      error: null,
    };
  }

  async fetchPayments(invoiceExternalId: string): Promise<GatewayPaymentResult> {
    if (!this.canHttp()) {
      return { ok: true, payments: [], invoice: null, error: null };
    }
    const result = await this.httpJson(
      'GET',
      `/invoices/${encodeURIComponent(invoiceExternalId)}/payments`,
    );
    if (!result.ok) {
      return { ok: false, payments: [], invoice: null, error: result.error };
    }
    const payments = Array.isArray(result.json.payments) ? result.json.payments : [];
    return {
      ok: true,
      payments: payments.map((row) => ({
        externalId: String(row.externalId ?? ''),
        amountMinor: Number(row.amountMinor ?? 0),
        currency: String(row.currency ?? 'INR'),
        paidOn: String(row.paidOn ?? ''),
        method: row.method == null ? null : String(row.method),
        status: row.status == null ? null : String(row.status),
      })),
      invoice:
        result.json.invoice == null
          ? null
          : {
              status: String(result.json.invoice.status ?? INVOICE_STATUS.issued),
              totalMinor: Number(result.json.invoice.totalMinor ?? 0),
              balanceMinor: Number(result.json.invoice.balanceMinor ?? 0),
            },
      error: null,
    };
  }

  private canHttp() {
    const billing = this.config.get('billing', { infer: true });
    return billing.provider === 'http' && billing.apiBaseUrl != null && billing.apiToken != null;
  }

  private async httpJson(
    method: 'GET' | 'POST',
    path: string,
    body?: Record<string, unknown>,
  ): Promise<{ ok: boolean; json: Record<string, unknown> & { payments?: Array<Record<string, unknown>>; invoice?: Record<string, unknown> }; error: string | null }> {
    const billing = this.config.get('billing', { infer: true });
    try {
      const init: RequestInit = {
        method,
        headers: {
          Authorization: `Bearer ${billing.apiToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      };
      if (method !== 'GET') {
        init.body = JSON.stringify(body ?? {});
      }
      const response = await fetch(`${billing.apiBaseUrl}${path}`, init);
      const json = (await response.json().catch(() => ({}))) as Record<string, unknown> & {
        message?: string;
        payments?: Array<Record<string, unknown>>;
        invoice?: Record<string, unknown>;
      };
      if (!response.ok) {
        return { ok: false, json, error: json.message ?? `Billing ${response.status}` };
      }
      return { ok: true, json, error: null };
    } catch {
      return { ok: false, json: {}, error: 'Billing gateway unreachable' };
    }
  }
}

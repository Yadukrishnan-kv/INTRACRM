import { API_BASE_URL, request, type ApiResult } from '../../api/client';
import type {
  LeadOption,
  PublicWarranty,
  Quotation,
  QuotationCatalog,
  QuotationEngineDashboard,
  QuotationInput,
  Warranty,
  WarrantyCatalog,
  WarrantyFile,
  WarrantyInput,
} from './types';

const PAGE = 20;

export type QuotationListQuery = {
  status?: string;
  leadId?: string;
  pending?: boolean;
  bucket?: string;
};

export type WarrantyListQuery = {
  status?: string;
  leadId?: string;
  quotationId?: string;
  q?: string;
};

export const salesApi = {
  // Quotations
  quotationCatalog: () => request<QuotationCatalog>('/quotations/catalog').then((r) => r.data),
  quotations: (query: QuotationListQuery, cursor?: string): Promise<ApiResult<Quotation[]>> =>
    request<Quotation[]>('/quotations', {
      query: {
        limit: PAGE,
        cursor,
        status: query.status,
        leadId: query.leadId,
        pending: query.pending ? 'true' : undefined,
        bucket: query.bucket,
      },
    }),
  quotation: (id: string) => request<Quotation>(`/quotations/${id}`).then((r) => r.data),
  createQuotation: (body: QuotationInput) =>
    request<Quotation>('/quotations', { method: 'POST', body }).then((r) => r.data),
  updateQuotation: (id: string, body: Partial<QuotationInput>) =>
    request<Quotation>(`/quotations/${id}`, { method: 'PATCH', body }).then((r) => r.data),
  deleteQuotation: (id: string) => request<unknown>(`/quotations/${id}`, { method: 'DELETE' }).then(() => undefined),
  sendQuotation: (id: string, body: { version: number; notes?: string; expectedCloseOn?: string; nextFollowUpAt?: string }) =>
    request<Quotation>(`/quotations/${id}/send`, { method: 'POST', body }).then((r) => r.data),
  changeQuotationStatus: (id: string, body: { version: number; status: string; reason?: string }) =>
    request<Quotation>(`/quotations/${id}/status`, { method: 'POST', body }).then((r) => r.data),
  quotationFollowUp: (
    id: string,
    body: { version: number; nextFollowUpAt?: string; remindAt?: string; expectedCloseOn?: string; note?: string; logged?: boolean },
  ) => request<Quotation>(`/quotations/${id}/follow-up`, { method: 'POST', body }).then((r) => r.data),
  engineDashboard: () => request<QuotationEngineDashboard>('/quotations/engine/dashboard').then((r) => r.data),
  runEngine: () =>
    request<{ tenants: number; notified: number }>('/quotations/engine/run', { method: 'POST' }).then((r) => r.data),

  // Warranties
  warrantyCatalog: () => request<WarrantyCatalog>('/warranties/catalog').then((r) => r.data),
  warranties: (query: WarrantyListQuery, cursor?: string): Promise<ApiResult<Warranty[]>> =>
    request<Warranty[]>('/warranties', {
      query: { limit: PAGE, cursor, status: query.status, leadId: query.leadId, quotationId: query.quotationId, q: query.q },
    }),
  warranty: (id: string) => request<Warranty>(`/warranties/${id}`).then((r) => r.data),
  createWarranty: (body: WarrantyInput) => request<Warranty>('/warranties', { method: 'POST', body }).then((r) => r.data),
  updateWarranty: (id: string, body: Partial<WarrantyInput> & { version: number }) =>
    request<Warranty>(`/warranties/${id}`, { method: 'PATCH', body }).then((r) => r.data),
  changeWarrantyStatus: (id: string, body: { version: number; status: string }) =>
    request<Warranty>(`/warranties/${id}/status`, { method: 'POST', body }).then((r) => r.data),
  warrantyQr: (id: string) => request<WarrantyFile>(`/warranties/${id}/qr`).then((r) => r.data),
  warrantyPdf: (id: string) => request<WarrantyFile>(`/warranties/${id}/pdf`).then((r) => r.data),

  // Lookups
  searchLeads: (q: string) =>
    request<LeadOption[]>('/leads', { query: { q: q || undefined, limit: 20 } }).then((r) => r.data),
  lead: (id: string) => request<LeadOption>(`/leads/${id}`).then((r) => r.data),
};

/** Error thrown by the unauthenticated public warranty calls. */
export class PublicWarrantyError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'PublicWarrantyError';
  }
}

function problemMessage(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    const root = body as Record<string, unknown>;
    const problem = (root.error && typeof root.error === 'object' ? root.error : root) as Record<string, unknown>;
    if (typeof problem.detail === 'string') return problem.detail;
    if (typeof problem.title === 'string') return problem.title;
  }
  return fallback;
}

/**
 * Public verification. Deliberately plain fetch: no Authorization, tenant or
 * device headers. GET /public/warranty/:token returns the usual {data} envelope;
 * errors come back as {error:{...}} problem details.
 */
export async function fetchPublicWarranty(token: string, signal?: AbortSignal): Promise<PublicWarranty> {
  const response = await fetch(`${API_BASE_URL}/public/warranty/${encodeURIComponent(token)}`, {
    headers: { Accept: 'application/json' },
    signal,
  });
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Non-JSON (proxy error page); handled below.
  }
  if (!response.ok) {
    throw new PublicWarrantyError(
      response.status === 404 ? 'Warranty card not found.' : problemMessage(body, `Verification failed (${response.status}).`),
      response.status,
    );
  }
  const data = body && typeof body === 'object' && 'data' in body ? (body as { data: unknown }).data : body;
  if (!data || typeof data !== 'object') throw new PublicWarrantyError('Unexpected response from the server.', response.status);
  return data as PublicWarranty;
}

/**
 * GET /public/warranty/:token/pdf bypasses the envelope and streams the PDF
 * (Content-Disposition attachment); on failure it returns an HTML 404 page.
 */
export async function fetchPublicWarrantyPdf(token: string): Promise<{ blob: Blob; filename: string | null }> {
  const response = await fetch(`${API_BASE_URL}/public/warranty/${encodeURIComponent(token)}/pdf`, {
    headers: { Accept: 'application/pdf' },
  });
  const type = response.headers.get('Content-Type') ?? '';
  if (!response.ok || !type.includes('pdf')) {
    throw new PublicWarrantyError('The PDF for this card is not available.', response.status);
  }
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  return { blob: await response.blob(), filename: match?.[1] ? decodeURIComponent(match[1]) : null };
}

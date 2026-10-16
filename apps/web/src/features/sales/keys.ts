import type { QuotationListQuery, WarrantyListQuery } from './api';

export const salesKeys = {
  quotationsAll: ['quotations'] as const,
  quotations: (q: QuotationListQuery) => ['quotations', 'list', q] as const,
  quotation: (id: string) => ['quotations', 'detail', id] as const,
  quotationCatalog: ['quotations', 'catalog'] as const,
  engine: ['quotations', 'engine'] as const,
  warrantiesAll: ['warranties'] as const,
  warranties: (q: WarrantyListQuery) => ['warranties', 'list', q] as const,
  warranty: (id: string) => ['warranties', 'detail', id] as const,
  warrantyQr: (id: string) => ['warranties', 'qr', id] as const,
  warrantyCatalog: ['warranties', 'catalog'] as const,
};

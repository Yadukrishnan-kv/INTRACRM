import { WARRANTY_STATUSES, WarrantyStatusCode } from './warranty-types';

export type WarrantyReportInput = {
  storedStatus: string;
  effectiveStatus: string;
};

export type WarrantyReportView = {
  generatedAt: string;
  totals: {
    total: number;
    active: number;
    expired: number;
    claimed: number;
    void: number;
  };
  byStatus: Array<{ status: string; count: number }>;
};

export function summarizeWarranties(rows: WarrantyReportInput[]): Omit<WarrantyReportView, 'generatedAt'> {
  const counts: Record<WarrantyStatusCode, number> = {
    active: 0,
    expired: 0,
    claimed: 0,
    void: 0,
  };
  for (const row of rows) {
    const status = (WARRANTY_STATUSES as readonly string[]).includes(row.effectiveStatus)
      ? (row.effectiveStatus as WarrantyStatusCode)
      : 'active';
    counts[status] += 1;
  }
  return {
    totals: {
      total: rows.length,
      active: counts.active,
      expired: counts.expired,
      claimed: counts.claimed,
      void: counts.void,
    },
    byStatus: WARRANTY_STATUSES.map((status) => ({ status, count: counts[status] })),
  };
}

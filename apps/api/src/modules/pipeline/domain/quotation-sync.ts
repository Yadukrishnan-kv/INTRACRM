/**
 * How a quotation's status drives its lead through the Status Pipeline.
 *
 *   sent / follow-up / customer deciding  -> Quotation stage
 *   negotiation / approved                -> Negotiation stage
 *   won (accepted by the customer)        -> Won
 *   draft / lost                          -> no automatic move (a rejected
 *                                            quotation may be re-quoted; the
 *                                            UI offers "Mark lead as lost")
 *
 * Moves are forward-only: an open lead is never pulled back to an earlier
 * stage, and closed (won/lost) leads are left alone — except that an accepted
 * quotation always closes its lead as Won, since the deal has happened.
 */
export type QuotationStageTarget = 'quotation' | 'negotiation' | 'won';

const TARGET_BY_STATUS: Record<string, QuotationStageTarget> = {
  sent: 'quotation',
  follow_up: 'quotation',
  customer_deciding: 'quotation',
  negotiation: 'negotiation',
  approved: 'negotiation',
  won: 'won',
};

export function quotationStageTarget(quotationStatus: string): QuotationStageTarget | null {
  return TARGET_BY_STATUS[quotationStatus] ?? null;
}

export type SyncLead = { lifecycleStatus: string; stageSortOrder: number };
export type SyncStage = { sortOrder: number; isWon: boolean; isLost: boolean };

export function shouldAdvanceLead(lead: SyncLead, target: SyncStage): boolean {
  if (target.isLost) {
    return false;
  }
  if (target.isWon) {
    return lead.lifecycleStatus !== 'won';
  }
  return lead.lifecycleStatus === 'open' && target.sortOrder > lead.stageSortOrder;
}

/** Picks the pipeline stage for a target: Won by flag, others by code. */
export function findTargetStage<S extends { code: string; isWon: boolean }>(
  stages: S[],
  target: QuotationStageTarget,
): S | undefined {
  if (target === 'won') {
    return stages.find((stage) => stage.isWon);
  }
  return stages.find((stage) => stage.code === target);
}

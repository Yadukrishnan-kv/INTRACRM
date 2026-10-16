// The incentive plan editor's working copy: what the form holds before it is
// saved, in the units people type (₹ and %), plus the checks and request
// bodies the API expects (paise and basis points).
// Port of mobile lib/features/incentives/domain/incentive_plan_draft.dart and
// the save sequence in incentive_plan_form_page.dart.

import { rupeesShort } from './logic';
import type { IncentivePlan, IncentiveSlab, PayoutKind } from './types';

export const PAYOUT_KIND_TITLES: Record<PayoutKind, string> = {
  percent: '% of sales',
  flat: 'Flat amount',
  per_unit: 'Per unit',
};

function parseNumber(raw: string, allowCommas: boolean): number | null {
  const text = allowCommas ? raw.trim().replace(/,/g, '') : raw.trim();
  if (text === '') return null;
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/** `12.5` (%) → `1250` (bps). Null for blank or invalid input. */
export function percentToBps(raw: string): number | null {
  const value = parseNumber(raw, false);
  return value === null ? null : Math.round(value * 100);
}

/** `5000` (₹) → `500000` (paise). Null for blank or invalid input. */
export function rupeesToPaise(raw: string): number | null {
  const value = parseNumber(raw, true);
  return value === null ? null : Math.round(value * 100);
}

/** `1250` → `12.5`, `8000` → `80`: the text a field starts with. */
export function bpsToPercentText(bps: number | null | undefined): string {
  if (bps === null || bps === undefined) return '';
  return String(bps / 100);
}

/** `500000` → `5000`, `1250` → `12.50`: paise back to the rupees a field shows. */
export function paiseToRupeesText(paise: number | null | undefined): string {
  if (paise === null || paise === undefined) return '';
  const value = paise / 100;
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2);
}

/** Money pays on revenue, units sold on units, anything else on a plain count. */
export function basisForMetric(metricCode: string, isMoney: boolean): string {
  if (isMoney) return 'revenue';
  return metricCode === 'units_sold' ? 'units' : 'count';
}

/** Percent of a count is meaningless: money offers percent + flat, counts flat + per unit. */
export function payoutKindsFor(isMoney: boolean): PayoutKind[] {
  return isMoney ? ['percent', 'flat'] : ['flat', 'per_unit'];
}

export type BandDraft = {
  /** Stable local identity for list keys and replacement. */
  key: number;
  /** Null until the band exists on the server, so a retry does not create it twice. */
  serverId: string | null;
  label: string | null;
  fromBps: number;
  /** Exclusive upper bound; null for an open top band. */
  toBps: number | null;
  payoutKind: PayoutKind;
  rateBps: number | null;
  amountPaise: number | null;
  perUnitPaise: number | null;
  bonusPaise: number;
  /** Changed since it was loaded from the server. */
  dirty: boolean;
};

export function bandFromSlab(slab: IncentiveSlab, key: number): BandDraft {
  return {
    key,
    serverId: slab.id,
    label: slab.label,
    fromBps: slab.fromBps,
    toBps: slab.toBps,
    payoutKind: slab.payoutKind,
    rateBps: slab.rateBps,
    amountPaise: slab.amount === null ? null : Math.round(slab.amount),
    perUnitPaise: slab.perUnitAmount === null ? null : Math.round(slab.perUnitAmount),
    bonusPaise: Math.round(slab.bonusAmount ?? 0),
    dirty: false,
  };
}

/** `80% – 100%`, or `120%+` for an open top band. */
export function bandLabel(band: Pick<BandDraft, 'fromBps' | 'toBps'>): string {
  const from = `${bpsToPercentText(band.fromBps)}%`;
  return band.toBps === null ? `${from}+` : `${from} – ${bpsToPercentText(band.toBps)}%`;
}

/** `2% of sales + ₹5K`, `₹3K flat`, `₹50 / unit`. */
export function payoutLabel(band: BandDraft): string {
  const base =
    band.payoutKind === 'percent'
      ? `${bpsToPercentText(band.rateBps)}% of sales`
      : band.payoutKind === 'flat'
        ? `${rupeesShort(band.amountPaise ?? 0)} flat`
        : band.payoutKind === 'per_unit'
          ? `${rupeesShort(band.perUnitPaise ?? 0)} / unit`
          : '—';
  return band.bonusPaise > 0 ? `${base} + ${rupeesShort(band.bonusPaise)}` : base;
}

/** Label for a saved slab on the plan list. */
export function slabPayoutLabel(slab: IncentiveSlab): string {
  return payoutLabel(bandFromSlab(slab, 0));
}

/** Body for `POST|PATCH /incentives/plans/:id/slabs` — only the amount the kind uses. */
export function bandToJson(band: BandDraft): Record<string, unknown> {
  const json: Record<string, unknown> = {};
  if (band.label && band.label.trim()) json.label = band.label.trim();
  json.fromBps = band.fromBps;
  if (band.toBps !== null) json.toBps = band.toBps;
  json.payoutKind = band.payoutKind;
  if (band.payoutKind === 'percent') json.rateBps = band.rateBps;
  if (band.payoutKind === 'flat') json.amount = band.amountPaise;
  if (band.payoutKind === 'per_unit') json.perUnitAmount = band.perUnitPaise;
  json.bonusAmount = band.bonusPaise;
  return json;
}

/** Why one band cannot be saved as it stands, or null when it can. */
export function bandError(band: BandDraft): string | null {
  if (band.toBps !== null && band.toBps <= band.fromBps) return 'The upper % must be above the lower %.';
  const missing =
    band.payoutKind === 'percent'
      ? band.rateBps === null
      : band.payoutKind === 'flat'
        ? band.amountPaise === null
        : band.payoutKind === 'per_unit'
          ? band.perUnitPaise === null
          : true;
  return missing ? `Enter the ${(PAYOUT_KIND_TITLES[band.payoutKind] ?? band.payoutKind).toLowerCase()} for this band.` : null;
}

export function sortBands(bands: BandDraft[]): BandDraft[] {
  return [...bands].sort((a, b) => a.fromBps - b.fromBps);
}

const OPEN = Number.MAX_SAFE_INTEGER;

function overlaps(a: BandDraft, b: BandDraft): boolean {
  return a.fromBps < (b.toBps ?? OPEN) && b.fromBps < (a.toBps ?? OPEN);
}

/** The band `candidate` collides with, ignoring the band it replaces. */
export function overlappingBand(bands: BandDraft[], candidate: BandDraft): BandDraft | null {
  return bands.find((b) => b.key !== candidate.key && overlaps(b, candidate)) ?? null;
}

/** Soft problems worth a warning — the same rules the server reports as `coverageIssues`. */
export function coverageWarnings(bands: BandDraft[], minAttainmentBps: number): string[] {
  if (bands.length === 0) return ['Add at least one band, or nothing can be earned.'];
  const sorted = sortBands(bands);
  const warnings: string[] = [];
  const first = sorted[0]!;
  if (first.fromBps > minAttainmentBps) {
    warnings.push(
      `Nothing is paid between ${bpsToPercentText(minAttainmentBps)}% and ${bpsToPercentText(first.fromBps)}% — the first band starts higher than the minimum.`,
    );
  }
  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i]!;
    const next = sorted[i + 1]!;
    if (current.toBps === null) warnings.push(`${bandLabel(current)} has no upper limit but is not the top band.`);
    else if (next.fromBps > current.toBps)
      warnings.push(`Nothing is paid between ${bpsToPercentText(current.toBps)}% and ${bpsToPercentText(next.fromBps)}%.`);
  }
  const last = sorted[sorted.length - 1]!;
  if (last.toBps !== null) warnings.push(`Nothing is paid above ${bpsToPercentText(last.toBps)}% — leave the top band open-ended.`);
  return warnings;
}

export type BandChanges = { remove: string[]; update: BandDraft[]; create: BandDraft[] };

/** Server calls a save needs, ordered so bands never collide: removals, edits, then new bands. */
export function bandChanges(bands: BandDraft[], savedIds: string[]): BandChanges {
  const kept = new Set(bands.map((b) => b.serverId).filter((id): id is string => !!id));
  const sorted = sortBands(bands);
  return {
    remove: savedIds.filter((id) => !kept.has(id)),
    update: sorted.filter((b) => b.serverId !== null && b.dirty),
    create: sorted.filter((b) => b.serverId === null),
  };
}

export function isEmptyChanges(c: BandChanges): boolean {
  return c.remove.length === 0 && c.update.length === 0 && c.create.length === 0;
}

// ---------------------------------------------------------------------------
// Band editor (the mobile bottom sheet)

export type BandFormValues = { from: string; to: string; kind: PayoutKind; value: string; bonus: string; label: string };

export function bandFormValues(band: BandDraft | null, startBps: number, kinds: PayoutKind[]): BandFormValues {
  const kind = band && kinds.includes(band.payoutKind) ? band.payoutKind : kinds[0]!;
  const value = !band
    ? ''
    : band.payoutKind === 'percent'
      ? bpsToPercentText(band.rateBps)
      : band.payoutKind === 'flat'
        ? paiseToRupeesText(band.amountPaise)
        : paiseToRupeesText(band.perUnitPaise);
  return {
    from: bpsToPercentText(band?.fromBps ?? startBps),
    to: bpsToPercentText(band?.toBps),
    kind,
    value,
    bonus: !band || band.bonusPaise === 0 ? '' : paiseToRupeesText(band.bonusPaise),
    label: band?.label ?? '',
  };
}

/** Turns the band form into a band, or the message the sheet shows. */
export function bandFromForm(
  v: BandFormValues,
  ctx: { initial: BandDraft | null; keyForNew: number; others: BandDraft[] },
): { band: BandDraft } | { error: string } {
  const from = percentToBps(v.from);
  const toText = v.to.trim();
  const to = toText === '' ? null : percentToBps(toText);
  const bonusText = v.bonus.trim();
  const bonus = bonusText === '' ? 0 : rupeesToPaise(bonusText);
  if (from === null) return { error: 'Enter the % of target where this band starts.' };
  if (toText !== '' && to === null) return { error: 'Upper % must be a number, or empty for no upper limit.' };
  if (bonus === null) return { error: 'Bonus must be an amount in ₹, or empty.' };
  const money = v.kind === 'percent' ? null : rupeesToPaise(v.value);
  const band: BandDraft = {
    key: ctx.initial?.key ?? ctx.keyForNew,
    serverId: ctx.initial?.serverId ?? null,
    label: v.label.trim() || null,
    fromBps: from,
    toBps: to,
    payoutKind: v.kind,
    rateBps: v.kind === 'percent' ? percentToBps(v.value) : null,
    amountPaise: v.kind === 'flat' ? money : null,
    perUnitPaise: v.kind === 'per_unit' ? money : null,
    bonusPaise: bonus,
    dirty: !!ctx.initial?.serverId,
  };
  const error = bandError(band);
  if (error) return { error };
  const clash = overlappingBand(ctx.others, band);
  if (clash) return { error: `Overlaps the ${bandLabel(clash)} band. Adjust the range.` };
  return { band };
}

/** Where a new band starts: the top of the ladder, or the plan minimum. */
export function nextBandStart(bands: BandDraft[], minBps: number): number {
  const sorted = sortBands(bands);
  const last = sorted[sorted.length - 1];
  return last ? (last.toBps ?? last.fromBps) : minBps;
}

// ---------------------------------------------------------------------------
// Plan form

export type PlanFormValues = {
  name: string;
  description: string;
  metricCode: string;
  periodType: string;
  effectiveFrom: string;
  effectiveTo: string;
  minPercent: string;
  holdPercent: string;
  cap: string;
  status: 'draft' | 'active' | 'archived';
};

export type PlanFields = {
  name: string;
  description: string;
  metricCode: string;
  periodType: string;
  basis: string;
  minAttainmentBps: number;
  holdBps: number;
  payoutCap: number | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: 'draft' | 'active' | 'archived';
};

export function planFormValues(plan: IncentivePlan | null, defaultMetric: string, today: Date = new Date()): PlanFormValues {
  const pad = (n: number) => String(n).padStart(2, '0');
  if (!plan) {
    return {
      name: '',
      description: '',
      metricCode: defaultMetric,
      periodType: 'monthly',
      effectiveFrom: `${today.getFullYear()}-${pad(today.getMonth() + 1)}-01`,
      effectiveTo: '',
      minPercent: '80',
      holdPercent: '0',
      cap: '',
      status: 'draft',
    };
  }
  return {
    name: plan.name,
    description: plan.description ?? '',
    metricCode: plan.metricCode,
    periodType: plan.periodType,
    effectiveFrom: plan.effectiveFrom.slice(0, 10),
    effectiveTo: plan.effectiveTo?.slice(0, 10) ?? '',
    minPercent: bpsToPercentText(plan.minAttainmentBps),
    holdPercent: bpsToPercentText(plan.holdBps),
    cap: paiseToRupeesText(plan.payoutCap),
    status: plan.status,
  };
}

/** Validates the plan form (mobile's checks and messages, in order). */
export function validatePlan(v: PlanFormValues, bands: BandDraft[], isMoney: boolean): { fields: PlanFields } | { error: string } {
  const name = v.name.trim();
  const minBps = percentToBps(v.minPercent);
  const holdBps = percentToBps(v.holdPercent);
  const capText = v.cap.trim();
  const cap = capText === '' ? null : rupeesToPaise(capText);
  if (name.length < 2) return { error: 'Give the plan a name.' };
  if (!v.metricCode) return { error: 'Choose what the plan measures.' };
  if (minBps === null) return { error: 'Enter a minimum attainment %, or 0.' };
  if (holdBps === null || holdBps > 10000) return { error: 'Hold-back must be between 0 and 100%.' };
  if (capText !== '' && cap === null) return { error: 'Payout cap must be an amount in ₹, or left empty.' };
  for (const band of bands) {
    const error = bandError(band);
    if (error) return { error: `${bandLabel(band)}: ${error}` };
  }
  if (v.status === 'active' && bands.length === 0) return { error: 'Add at least one band before activating the plan.' };
  return {
    fields: {
      name,
      description: v.description.trim(),
      metricCode: v.metricCode,
      periodType: v.periodType,
      basis: basisForMetric(v.metricCode, isMoney),
      minAttainmentBps: minBps,
      holdBps,
      payoutCap: cap,
      effectiveFrom: v.effectiveFrom,
      effectiveTo: v.effectiveTo || null,
      status: v.status,
    },
  };
}

/** What the server already holds, so a retry resumes instead of repeating calls. */
export type SavedPlanState = {
  planId: string | null;
  version: number;
  savedStatus: string;
  savedSlabIds: string[];
  bands: BandDraft[];
};

export type PlanSaveApi = {
  createPlan: (body: Record<string, unknown>) => Promise<{ id: string; version: number; status: string }>;
  updatePlan: (id: string, body: Record<string, unknown>) => Promise<{ version: number; status: string }>;
  addSlab: (planId: string, body: Record<string, unknown>) => Promise<{ id: string }>;
  updateSlab: (planId: string, slabId: string, body: Record<string, unknown>) => Promise<unknown>;
  deleteSlab: (planId: string, slabId: string) => Promise<unknown>;
};

/**
 * Saves the plan in mobile's order: the plan (always created as a draft), then
 * band removals, edits and additions, then the status. Each step updates the
 * returned state, so after a failure the next call picks up where it stopped.
 */
export async function savePlan(
  api: PlanSaveApi,
  fields: PlanFields,
  initial: SavedPlanState,
  describeError: (e: unknown) => string,
): Promise<{ state: SavedPlanState; error: string | null }> {
  const state: SavedPlanState = { ...initial, bands: [...initial.bands], savedSlabIds: [...initial.savedSlabIds] };
  const replace = (band: BandDraft) => {
    state.bands = state.bands.map((b) => (b.key === band.key ? band : b));
  };
  try {
    if (state.planId === null) {
      const body: Record<string, unknown> = {
        name: fields.name,
        metricCode: fields.metricCode,
        periodType: fields.periodType,
        scopeType: 'membership',
        basis: fields.basis,
        status: 'draft',
        holdBps: fields.holdBps,
        minAttainmentBps: fields.minAttainmentBps,
        effectiveFrom: fields.effectiveFrom,
      };
      if (fields.description) body.description = fields.description;
      if (fields.payoutCap !== null) body.payoutCap = fields.payoutCap;
      if (fields.effectiveTo) body.effectiveTo = fields.effectiveTo;
      const created = await api.createPlan(body);
      state.planId = created.id;
      state.version = created.version;
      state.savedStatus = created.status;
    } else {
      const body: Record<string, unknown> = {
        name: fields.name,
        description: fields.description,
        holdBps: fields.holdBps,
        minAttainmentBps: fields.minAttainmentBps,
        // Null clears a cap that was set before.
        payoutCap: fields.payoutCap,
        version: state.version,
      };
      if (fields.effectiveTo) body.effectiveTo = fields.effectiveTo;
      const updated = await api.updatePlan(state.planId, body);
      state.version = updated.version;
    }
  } catch (e) {
    return { state, error: describeError(e) };
  }

  const planId = state.planId;
  const changes = bandChanges(state.bands, state.savedSlabIds);
  for (const id of changes.remove) {
    try {
      await api.deleteSlab(planId, id);
    } catch (e) {
      return { state, error: describeError(e) };
    }
    state.savedSlabIds = state.savedSlabIds.filter((s) => s !== id);
  }
  for (const band of changes.update) {
    try {
      await api.updateSlab(planId, band.serverId!, bandToJson(band));
    } catch (e) {
      return { state, error: `${bandLabel(band)}: ${describeError(e)}` };
    }
    replace({ ...band, dirty: false });
  }
  for (const band of changes.create) {
    try {
      const created = await api.addSlab(planId, bandToJson(band));
      replace({ ...band, serverId: created.id, dirty: false });
      state.savedSlabIds = [...state.savedSlabIds, created.id];
    } catch (e) {
      return { state, error: `${bandLabel(band)}: ${describeError(e)}` };
    }
  }

  if (fields.status !== state.savedStatus) {
    try {
      const updated = await api.updatePlan(planId, { status: fields.status, version: state.version });
      state.version = updated.version;
      state.savedStatus = updated.status;
    } catch (e) {
      return { state, error: describeError(e) };
    }
  }
  return { state, error: null };
}

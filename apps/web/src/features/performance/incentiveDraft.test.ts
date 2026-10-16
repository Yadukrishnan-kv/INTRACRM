// Port of mobile test/features/incentives/incentive_plan_draft_test.dart and
// the save-sequence cases from incentive_plan_form_test.dart.
import { describe, expect, it } from 'vitest';
import {
  bandChanges,
  bandError,
  bandFromForm,
  bandFromSlab,
  bandLabel,
  bandToJson,
  basisForMetric,
  bpsToPercentText,
  coverageWarnings,
  isEmptyChanges,
  overlappingBand,
  paiseToRupeesText,
  payoutKindsFor,
  percentToBps,
  planFormValues,
  rupeesToPaise,
  savePlan,
  validatePlan,
  type BandDraft,
  type PlanSaveApi,
  type SavedPlanState,
} from './incentiveDraft';
import type { PayoutKind } from './types';

function band(
  key: number,
  from: number,
  to: number | null,
  o: { kind?: PayoutKind; rate?: number | null; amount?: number | null; perUnit?: number | null; serverId?: string; dirty?: boolean; bonus?: number } = {},
): BandDraft {
  return {
    key,
    fromBps: from,
    toBps: to,
    payoutKind: o.kind ?? 'percent',
    rateBps: o.rate === undefined ? 200 : o.rate,
    amountPaise: o.amount ?? null,
    perUnitPaise: o.perUnit ?? null,
    serverId: o.serverId ?? null,
    dirty: o.dirty ?? false,
    label: null,
    bonusPaise: o.bonus ?? 0,
  };
}

describe('unit conversion', () => {
  it('percent text becomes basis points', () => {
    expect(percentToBps('80')).toBe(8000);
    expect(percentToBps('12.5')).toBe(1250);
    expect(percentToBps(' 0 ')).toBe(0);
    expect(percentToBps('')).toBeNull();
    expect(percentToBps('-1')).toBeNull();
  });

  it('rupees become paise, commas allowed', () => {
    expect(rupeesToPaise('5000')).toBe(500000);
    expect(rupeesToPaise('50,000')).toBe(5000000);
    expect(rupeesToPaise('12.50')).toBe(1250);
    expect(rupeesToPaise('abc')).toBeNull();
  });

  it('server values round-trip back into field text', () => {
    expect(bpsToPercentText(8000)).toBe('80');
    expect(bpsToPercentText(1250)).toBe('12.5');
    expect(bpsToPercentText(null)).toBe('');
    expect(paiseToRupeesText(500000)).toBe('5000');
    expect(paiseToRupeesText(1250)).toBe('12.50');
  });

  it('basis follows the metric', () => {
    expect(basisForMetric('revenue', true)).toBe('revenue');
    expect(basisForMetric('units_sold', false)).toBe('units');
    expect(basisForMetric('quotations_accepted', false)).toBe('count');
  });

  it('percent is only offered on money metrics', () => {
    expect(payoutKindsFor(true)).toContain('percent');
    expect(payoutKindsFor(false)).not.toContain('percent');
  });
});

describe('band checks', () => {
  it('a band needs its matching amount', () => {
    expect(bandError(band(0, 8000, 10000))).toBeNull();
    expect(bandError(band(0, 8000, 10000, { rate: null }))).not.toBeNull();
    expect(bandError(band(0, 8000, 10000, { kind: 'flat', rate: null }))).not.toBeNull();
    expect(bandError(band(0, 8000, 10000, { kind: 'flat', rate: null, amount: 300000 }))).toBeNull();
  });

  it('upper bound must be above the lower bound', () => {
    expect(bandError(band(0, 10000, 10000))).not.toBeNull();
    expect(bandError(band(0, 10000, 8000))).not.toBeNull();
  });

  it('touching bands do not overlap; crossing ones do', () => {
    const bands = [band(0, 8000, 10000), band(1, 10000, null)];
    expect(overlappingBand(bands, band(2, 12000, null))).not.toBeNull();
    expect(overlappingBand(bands, band(2, 9000, 11000))).not.toBeNull();
    expect(overlappingBand([band(0, 8000, 10000)], band(1, 10000, null))).toBeNull();
  });

  it('editing a band does not collide with its own old range', () => {
    const bands = [band(0, 8000, 10000), band(1, 10000, null)];
    expect(overlappingBand(bands, band(0, 7000, 10000))).toBeNull();
  });
});

describe('coverage warnings', () => {
  it('a clean ladder has none', () => {
    const bands = [band(0, 8000, 10000), band(1, 10000, 12000), band(2, 12000, null)];
    expect(coverageWarnings(bands, 8000)).toEqual([]);
  });

  it('flags no bands, a late start, gaps and a closed top', () => {
    expect(coverageWarnings([], 0)).toHaveLength(1);
    const warnings = coverageWarnings([band(0, 9000, 10000), band(1, 11000, 13000)], 8000);
    expect(warnings).toHaveLength(3);
    expect(warnings.join(' ')).toContain('80%');
    expect(warnings.join(' ')).toContain('100% and 110%');
    expect(warnings.join(' ')).toContain('above 130%');
  });
});

describe('save plan', () => {
  it('removes, then updates, then creates', () => {
    const bands = [
      band(0, 8000, 10000, { serverId: 'kept' }),
      band(1, 10000, 12000, { serverId: 'edited', dirty: true }),
      band(2, 12000, null),
    ];
    const changes = bandChanges(bands, ['kept', 'edited', 'gone']);
    expect(changes.remove).toEqual(['gone']);
    expect(changes.update.map((b) => b.serverId)).toEqual(['edited']);
    expect(changes.create.map((b) => b.key)).toEqual([2]);
  });

  it('nothing to do when nothing changed', () => {
    expect(isEmptyChanges(bandChanges([band(0, 8000, null, { serverId: 'a' })], ['a']))).toBe(true);
  });
});

it('request body carries only the amount the kind uses, in API units', () => {
  const json = bandToJson(band(0, 10000, null, { kind: 'percent', rate: 300, amount: 999 }));
  expect(json).toEqual({ fromBps: 10000, payoutKind: 'percent', rateBps: 300, bonusAmount: 0 });
});

it('a server slab loads into an editable band', () => {
  const draft = bandFromSlab(
    { id: 's1', planId: 'p', label: null, fromBps: 10000, toBps: null, payoutKind: 'flat', rateBps: null, amount: 300000, perUnitAmount: null, bonusAmount: 50000 },
    4,
  );
  expect(draft.serverId).toBe('s1');
  expect(draft.amountPaise).toBe(300000);
  expect(draft.bonusPaise).toBe(50000);
  expect(bandLabel(draft)).toBe('100%+');
  expect(draft.dirty).toBe(false);
});

describe('band form', () => {
  it('refuses an overlapping band', () => {
    const others = [band(0, 8000, 12000)];
    const result = bandFromForm(
      { from: '100', to: '', kind: 'percent', value: '3', bonus: '', label: '' },
      { initial: null, keyForNew: 1, others },
    );
    expect(result).toEqual({ error: 'Overlaps the 80% – 120% band. Adjust the range.' });
  });

  it('marks an edited saved band dirty', () => {
    const initial = band(0, 8000, null, { serverId: 's1' });
    const result = bandFromForm(
      { from: '80', to: '', kind: 'flat', value: '3,000', bonus: '500', label: ' Star ' },
      { initial, keyForNew: 9, others: [initial] },
    );
    expect('band' in result && result.band).toMatchObject({ key: 0, serverId: 's1', dirty: true, amountPaise: 300000, bonusPaise: 50000, label: 'Star' });
  });
});

// The save sequence from incentive_plan_form_test.dart, against a recording fake.
function fakeApi() {
  const calls: string[] = [];
  const bodies: Record<string, unknown>[] = [];
  let failNextSlab = false;
  let seq = 0;
  const api: PlanSaveApi = {
    createPlan: async (body) => {
      calls.push('createPlan');
      bodies.push(body);
      return { id: 'plan-1', version: 1, status: 'draft' };
    },
    updatePlan: async (_id, body) => {
      calls.push(`updatePlan:${(body.status as string | undefined) ?? 'fields'}`);
      bodies.push(body);
      return { version: 2, status: (body.status as string | undefined) ?? 'draft' };
    },
    addSlab: async (_id, body) => {
      calls.push(`addSlab:${String(body.fromBps)}`);
      bodies.push(body);
      if (failNextSlab) {
        failNextSlab = false;
        throw new Error('This band overlaps an existing slab');
      }
      return { id: `slab-${seq++}` };
    },
    updateSlab: async () => {
      calls.push('updateSlab');
    },
    deleteSlab: async () => {
      calls.push('deleteSlab');
    },
  };
  return { api, calls, bodies, failOnce: () => (failNextSlab = true) };
}

const fresh = (bands: BandDraft[]): SavedPlanState => ({ planId: null, version: 1, savedStatus: 'draft', savedSlabIds: [], bands });
const describeError = (e: unknown) => (e instanceof Error ? e.message : String(e));

describe('plan save sequence', () => {
  const values = { ...planFormValues(null, 'revenue', new Date(2026, 9, 5)), name: 'Monthly Revenue', holdPercent: '10', cap: '50000', status: 'active' as const };

  it('creates the plan as a draft, adds bands, then activates it', async () => {
    const bands = [band(0, 8000, 10000, { rate: 200 }), band(1, 10000, null, { rate: 300, bonus: 500000 })];
    const v = validatePlan(values, bands, true);
    if (!('fields' in v)) throw new Error(v.error);
    const { api, calls, bodies } = fakeApi();
    const { error, state } = await savePlan(api, v.fields, fresh(bands), describeError);
    expect(error).toBeNull();
    expect(calls).toEqual(['createPlan', 'addSlab:8000', 'addSlab:10000', 'updatePlan:active']);
    expect(bodies[0]).toMatchObject({ status: 'draft', basis: 'revenue', minAttainmentBps: 8000, holdBps: 1000, payoutCap: 5000000, effectiveFrom: '2026-10-01' });
    expect(bodies[1]).toEqual({ fromBps: 8000, toBps: 10000, payoutKind: 'percent', rateBps: 200, bonusAmount: 0 });
    expect(bodies[2]).toEqual({ fromBps: 10000, payoutKind: 'percent', rateBps: 300, bonusAmount: 500000 });
    expect(state.savedStatus).toBe('active');
  });

  it('resumes after a band fails: only the failed band is sent again', async () => {
    const bands = [band(0, 8000, null)];
    const v = validatePlan({ ...values, status: 'draft' }, bands, true);
    if (!('fields' in v)) throw new Error(v.error);
    const { api, calls, failOnce } = fakeApi();
    failOnce();
    const first = await savePlan(api, v.fields, fresh(bands), describeError);
    expect(calls).toEqual(['createPlan', 'addSlab:8000']);
    expect(first.error).toBe('80%+: This band overlaps an existing slab');
    calls.length = 0;
    const second = await savePlan(api, v.fields, first.state, describeError);
    expect(second.error).toBeNull();
    expect(calls).toEqual(['updatePlan:fields', 'addSlab:8000']);
  });

  it('refuses to activate without bands', () => {
    expect(validatePlan(values, [], true)).toEqual({ error: 'Add at least one band before activating the plan.' });
    expect(validatePlan({ ...values, name: 'x' }, [], true)).toEqual({ error: 'Give the plan a name.' });
    expect(validatePlan({ ...values, holdPercent: '120' }, [], true)).toEqual({ error: 'Hold-back must be between 0 and 100%.' });
  });
});

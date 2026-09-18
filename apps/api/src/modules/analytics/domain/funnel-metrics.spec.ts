import { DEFAULT_PIPELINE_STAGES } from '../../pipeline/domain/default-pipeline';
import {
  buildFunnel,
  firstTouch,
  firstTouchInRange,
  isAnalyticsMetricCode,
  qualifiedIdsInPipeline,
  qualifiedStageIds,
  rateBps,
  uniqueCount,
} from './funnel-metrics';

const pipelineId = 'pipe-1';

function stages() {
  return DEFAULT_PIPELINE_STAGES.map((stage) => ({
    id: stage.code,
    pipelineId,
    code: stage.code,
    name: stage.name,
    sortOrder: stage.sortOrder,
    winProbabilityBps: stage.winProbabilityBps,
    isWon: stage.isWon,
    isLost: stage.isLost,
  }));
}

describe('funnel analytics', () => {
  it('recognizes metric codes', () => {
    expect(isAnalyticsMetricCode('leads')).toBe(true);
    expect(isAnalyticsMetricCode('conversion')).toBe(true);
    expect(isAnalyticsMetricCode('orders')).toBe(false);
  });

  it('treats qualified and later non-lost stages as qualified', () => {
    const ids = qualifiedIdsInPipeline(stages());
    expect([...ids]).toEqual(['qualified', 'site_visit', 'quotation', 'negotiation', 'won']);
    expect(ids.has('new')).toBe(false);
    expect(ids.has('lost')).toBe(false);
  });

  it('falls back to win probability when the stage is not named qualified', () => {
    const ids = qualifiedIdsInPipeline([
      {
        id: 'a',
        pipelineId,
        code: 'intake',
        name: 'Intake',
        sortOrder: 10,
        winProbabilityBps: 1000,
        isWon: false,
        isLost: false,
      },
      {
        id: 'b',
        pipelineId,
        code: 'ready',
        name: 'Ready to quote',
        sortOrder: 20,
        winProbabilityBps: 4500,
        isWon: false,
        isLost: false,
      },
      {
        id: 'c',
        pipelineId,
        code: 'closed',
        name: 'Closed',
        sortOrder: 30,
        winProbabilityBps: 10000,
        isWon: true,
        isLost: false,
      },
    ]);
    expect([...ids]).toEqual(['b', 'c']);
  });

  it('unions qualified stages across pipelines', () => {
    const ids = qualifiedStageIds([
      ...stages(),
      {
        id: 'other-qualified',
        pipelineId: 'pipe-2',
        code: 'qualified',
        name: 'Qualified',
        sortOrder: 30,
        winProbabilityBps: 4000,
        isWon: false,
        isLost: false,
      },
    ]);
    expect(ids.has('qualified')).toBe(true);
    expect(ids.has('other-qualified')).toBe(true);
  });

  it('keeps the earliest touch per lead and excludes prior qualifications', () => {
    const first = firstTouch([
      { id: 'l1', at: new Date('2026-08-16T12:00:00.000Z') },
      { id: 'l1', at: new Date('2026-08-16T08:00:00.000Z') },
      { id: 'l2', at: new Date('2026-08-17T08:00:00.000Z') },
    ]);
    expect(first).toEqual([
      { id: 'l1', at: new Date('2026-08-16T08:00:00.000Z') },
      { id: 'l2', at: new Date('2026-08-17T08:00:00.000Z') },
    ]);
    const inRange = firstTouchInRange(
      first,
      ['l1'],
      { gte: new Date('2026-08-16T00:00:00.000Z'), lt: new Date('2026-08-18T00:00:00.000Z') },
    );
    expect(inRange.map((row) => row.id)).toEqual(['l2']);
  });

  it('builds funnel conversion from live counts', () => {
    expect(rateBps(1, 4)).toBe(2500);
    expect(rateBps(1, 0)).toBeNull();
    expect(uniqueCount(['a', 'a', 'b'])).toBe(2);

    const funnel = buildFunnel({
      leads: 20,
      qualified: 10,
      quotations: 6,
      quotedLeads: 5,
      won: 2,
    });
    expect(funnel.steps.map((step) => step.code)).toEqual(['leads', 'qualified', 'quotations', 'won']);
    expect(funnel.steps[1]?.conversionFromPreviousBps).toBe(5000);
    expect(funnel.steps[1]?.dropOffCount).toBe(10);
    expect(funnel.steps[2]?.conversionFromPreviousBps).toBe(5000);
    expect(funnel.steps[3]?.conversionFromPreviousBps).toBe(3333);
    expect(funnel.conversion).toEqual({
      leadToQualifiedBps: 5000,
      qualifiedToQuotationBps: 5000,
      quotationToWonBps: 3333,
      overallBps: 1000,
    });
  });
});

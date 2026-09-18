import { DEFAULT_PIPELINE_STAGES } from '../../pipeline/domain/default-pipeline';
import { buildFunnelReport, mapPipelineToFunnel, mapStagesToFunnel } from './funnel-report';
import type { PipelineStageRef } from './funnel-metrics';

const pipelineId = 'pipe-1';

function stages(): PipelineStageRef[] {
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

describe('funnel report', () => {
  it('maps the default pipeline onto Lead → Qualified → Quotation → Negotiation → Won', () => {
    const mapped = mapPipelineToFunnel(stages());
    expect(mapped.get('new')).toBe('lead');
    expect(mapped.get('contacted')).toBe('lead');
    expect(mapped.get('qualified')).toBe('qualified');
    expect(mapped.get('site_visit')).toBe('qualified');
    expect(mapped.get('quotation')).toBe('quotation');
    expect(mapped.get('negotiation')).toBe('negotiation');
    expect(mapped.get('won')).toBe('won');
    expect(mapped.has('lost')).toBe(false);
  });

  it('keeps later stages reachable when names are missing', () => {
    const mapped = mapStagesToFunnel([
      {
        id: 's1',
        pipelineId,
        code: 'intake',
        name: 'Intake',
        sortOrder: 10,
        winProbabilityBps: 1000,
        isWon: false,
        isLost: false,
      },
      {
        id: 's2',
        pipelineId,
        code: 'ready',
        name: 'Ready',
        sortOrder: 20,
        winProbabilityBps: 4500,
        isWon: false,
        isLost: false,
      },
      {
        id: 's3',
        pipelineId,
        code: 'proposal',
        name: 'Proposal',
        sortOrder: 30,
        winProbabilityBps: 7200,
        isWon: false,
        isLost: false,
      },
      {
        id: 's4',
        pipelineId,
        code: 'closing',
        name: 'Closing',
        sortOrder: 40,
        winProbabilityBps: 8800,
        isWon: false,
        isLost: false,
      },
      {
        id: 's5',
        pipelineId,
        code: 'closed',
        name: 'Closed',
        sortOrder: 50,
        winProbabilityBps: 10000,
        isWon: true,
        isLost: false,
      },
    ]);
    expect(mapped.get('s1')).toBe('lead');
    expect(mapped.get('s2')).toBe('qualified');
    expect(mapped.get('s3')).toBe('quotation');
    expect(mapped.get('s4')).toBe('negotiation');
    expect(mapped.get('s5')).toBe('won');
  });

  it('builds a monotonic funnel with conversion, drop-off, and charts', () => {
    const report = buildFunnelReport({
      stages: stages(),
      days: ['2026-08-16', '2026-08-17'],
      timeZone: 'UTC',
      leads: [
        { id: 'l1', stageId: 'new', valueMinor: 10000, createdAt: new Date('2026-08-16T08:00:00.000Z') },
        { id: 'l2', stageId: 'qualified', valueMinor: 20000, createdAt: new Date('2026-08-16T09:00:00.000Z') },
        { id: 'l3', stageId: 'quotation', valueMinor: 30000, createdAt: new Date('2026-08-16T10:00:00.000Z') },
        { id: 'l4', stageId: 'negotiation', valueMinor: 40000, createdAt: new Date('2026-08-17T08:00:00.000Z') },
        { id: 'l5', stageId: 'won', valueMinor: 50000, createdAt: new Date('2026-08-17T09:00:00.000Z') },
        { id: 'l6', stageId: 'lost', valueMinor: 60000, createdAt: new Date('2026-08-17T10:00:00.000Z') },
      ],
      changes: [
        { id: 'l3', leadId: 'l3', toStageId: 'qualified', at: new Date('2026-08-16T11:00:00.000Z') },
        { id: 'l3', leadId: 'l3', toStageId: 'quotation', at: new Date('2026-08-16T12:00:00.000Z') },
        { id: 'l5', leadId: 'l5', toStageId: 'won', at: new Date('2026-08-17T09:30:00.000Z') },
      ],
    });

    expect(report.stages.map((stage) => stage.code)).toEqual([
      'lead',
      'qualified',
      'quotation',
      'negotiation',
      'won',
    ]);
    expect(report.stages[0]?.reachedCount).toBe(6);
    expect(report.stages[1]?.reachedCount).toBe(4);
    expect(report.stages[2]?.reachedCount).toBe(3);
    expect(report.stages[3]?.reachedCount).toBe(2);
    expect(report.stages[4]?.reachedCount).toBe(1);
    expect(report.stages[0]?.currentCount).toBe(1);
    expect(report.stages[1]?.currentCount).toBe(1);
    expect(report.stages[2]?.dropOffCount).toBe(1);
    expect(report.conversion.overallBps).toBe(1667);
    expect(report.conversion.leadToQualifiedBps).toBe(6667);
    expect(report.charts.funnel.map((item) => item.label)).toEqual([
      'Lead',
      'Qualified',
      'Quotation',
      'Negotiation',
      'Won',
    ]);
    expect(report.charts.trend).toHaveLength(2);
    expect(report.stages[4]?.series.map((point) => point.value)).toEqual([0, 1]);
  });
});

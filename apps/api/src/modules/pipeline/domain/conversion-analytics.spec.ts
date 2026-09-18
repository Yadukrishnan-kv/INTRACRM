import { rateBps, summarizeConversion, type StageSnapshot } from './conversion-analytics';
import { lifecycleForStage } from './default-pipeline';

function stage(partial: Partial<StageSnapshot> & Pick<StageSnapshot, 'id' | 'code'>): StageSnapshot {
  return {
    name: partial.code,
    sortOrder: 0,
    winProbabilityBps: 0,
    isWon: false,
    isLost: false,
    currentCount: 0,
    currentValueMinor: 0,
    reachedCount: 0,
    ...partial,
  };
}

describe('lifecycleForStage', () => {
  it('maps won and lost flags', () => {
    expect(lifecycleForStage({ isWon: true, isLost: false })).toBe('won');
    expect(lifecycleForStage({ isWon: false, isLost: true })).toBe('lost');
    expect(lifecycleForStage({ isWon: false, isLost: false })).toBe('open');
  });
});

describe('rateBps', () => {
  it('returns null when the denominator is zero', () => {
    expect(rateBps(3, 0)).toBeNull();
    expect(rateBps(1, 4)).toBe(2500);
  });
});

describe('summarizeConversion', () => {
  it('builds funnel conversion and outcome rates', () => {
    const report = summarizeConversion(
      [
        stage({ id: '1', code: 'new', sortOrder: 10, reachedCount: 20, currentCount: 8 }),
        stage({ id: '2', code: 'qualified', sortOrder: 30, reachedCount: 10, currentCount: 4 }),
        stage({
          id: '3',
          code: 'won',
          sortOrder: 70,
          reachedCount: 4,
          currentCount: 4,
          isWon: true,
        }),
        stage({
          id: '4',
          code: 'lost',
          sortOrder: 80,
          reachedCount: 6,
          currentCount: 6,
          isLost: true,
        }),
      ],
      { open: 12, won: 4, lost: 6, pipelineValueMinor: 90000, wonValueMinor: 40000 },
    );

    expect(report.totals).toEqual({
      open: 12,
      won: 4,
      lost: 6,
      leads: 22,
      pipelineValueMinor: 90000,
      wonValueMinor: 40000,
      winRateBps: 4000,
      conversionBps: 1818,
    });
    expect(report.stages[0]?.conversionFromPreviousBps).toBe(10000);
    expect(report.stages[1]?.conversionFromPreviousBps).toBe(5000);
    expect(report.stages[1]?.dropOffCount).toBe(10);
    expect(report.stages[2]?.conversionFromPreviousBps).toBe(4000);
  });
});

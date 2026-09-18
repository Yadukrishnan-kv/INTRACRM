import {
  assignDenseRanks,
  assignTeamRanks,
  computePerformanceScore,
  followUpCompletionBps,
  leadConversionBps,
  quotationConversionBps,
  salesAchievementBps,
  scoreBandFor,
  topByKpi,
} from './performance-score';

describe('staff performance KPIs', () => {
  it('computes lead conversion from decided leads, else created', () => {
    expect(leadConversionBps({ created: 10, won: 4, lost: 6 })).toBe(4000);
    expect(leadConversionBps({ created: 8, won: 2, lost: 0 })).toBe(10000);
    expect(leadConversionBps({ created: 8, won: 0, lost: 0 })).toBe(0);
    expect(leadConversionBps({ created: 0, won: 0, lost: 0 })).toBeNull();
  });

  it('computes follow-up completion against due work', () => {
    expect(followUpCompletionBps({ due: 10, completed: 8 })).toBe(8000);
    expect(followUpCompletionBps({ due: 4, completed: 9 })).toBe(10000);
    expect(followUpCompletionBps({ due: 0, completed: 1 })).toBeNull();
  });

  it('computes quotation conversion and uncapped sales achievement', () => {
    expect(quotationConversionBps({ sent: 10, won: 3, lost: 2 })).toBe(6000);
    expect(quotationConversionBps({ sent: 5, won: 1, lost: 0 })).toBe(10000);
    expect(quotationConversionBps({ sent: 5, won: 0, lost: 0 })).toBe(0);
    expect(salesAchievementBps({ target: 100000, achieved: 120000 })).toBe(12000);
    expect(salesAchievementBps({ target: 0, achieved: 5000 })).toBeNull();
  });
});

describe('performance score', () => {
  it('averages present KPIs with equal weights and skips nulls', () => {
    const all = computePerformanceScore({
      leadConversionBps: 8000,
      followUpCompletionBps: 8000,
      salesAchievementBps: 8000,
      quotationConversionBps: 8000,
    });
    expect(all.scoreBps).toBe(8000);
    expect(all.band).toBe('strong');
    expect(all.weightUsedBps).toBe(10000);

    const skipped = computePerformanceScore({
      leadConversionBps: 10000,
      followUpCompletionBps: 0,
      salesAchievementBps: null,
      quotationConversionBps: null,
    });
    expect(skipped.scoreBps).toBe(5000);
    expect(skipped.band).toBe('average');
    expect(skipped.weightUsedBps).toBe(5000);

    expect(
      computePerformanceScore({
        leadConversionBps: null,
        followUpCompletionBps: null,
        salesAchievementBps: null,
        quotationConversionBps: null,
      }).band,
    ).toBe('no_data');
    expect(scoreBandFor(9000)).toBe('outstanding');
    expect(scoreBandFor(4000)).toBe('needs_work');
  });
});

describe('ranking', () => {
  it('assigns dense company and team ranks', () => {
    const ranked = assignDenseRanks([
      {
        id: 'c',
        name: 'Cara',
        scoreBps: 7000,
        salesAchievementBps: 5000,
        revenueMinor: 1,
        teamId: 'east',
      },
      {
        id: 'a',
        name: 'Asha',
        scoreBps: 9000,
        salesAchievementBps: 8000,
        revenueMinor: 10,
        teamId: 'east',
      },
      {
        id: 'b',
        name: 'Bala',
        scoreBps: 9000,
        salesAchievementBps: 8000,
        revenueMinor: 10,
        teamId: 'west',
      },
    ]);
    expect(ranked.map((row) => row.id)).toEqual(['a', 'b', 'c']);
    expect(ranked.map((row) => row.rank)).toEqual([1, 1, 2]);

    const teamRanks = assignTeamRanks(ranked);
    expect(teamRanks.get('a')).toBe(1);
    expect(teamRanks.get('c')).toBe(2);
    expect(teamRanks.get('b')).toBe(1);
  });

  it('builds per-KPI leaderboards', () => {
    const rows = [
      { name: 'A', lead: 9000, follow: 1000 },
      { name: 'B', lead: 2000, follow: 8000 },
      { name: 'C', lead: null as number | null, follow: 9000 },
    ];
    expect(topByKpi(rows, (row) => row.lead, 2).map((row) => row.name)).toEqual(['A', 'B']);
    expect(topByKpi(rows, (row) => row.follow, 1).map((row) => row.name)).toEqual(['C']);
  });
});

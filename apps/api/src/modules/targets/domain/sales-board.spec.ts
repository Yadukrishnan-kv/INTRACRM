import {
  BOARD_PERIOD_CATALOG,
  buildInsights,
  dailyAverage,
  isBoardPeriod,
  paceNote,
  podium,
  rankStandings,
  suggestionsFor,
} from './sales-board';
import { computeAchievement } from './target-period';

function standing(name: string, achievedValue: number, achievementBps: number | null) {
  return {
    membershipId: name.toLowerCase(),
    name,
    designation: null,
    teamName: null,
    targetValue: 100,
    achievedValue,
    achievementBps,
    onTrack: true,
  };
}

describe('board periods', () => {
  it('exposes a catalog and rejects unknown codes', () => {
    expect(BOARD_PERIOD_CATALOG.map((entry) => entry.code)).toEqual([
      'this_month',
      'last_month',
      'this_quarter',
      'this_year',
    ]);
    expect(isBoardPeriod('this_month')).toBe(true);
    expect(isBoardPeriod('last_week')).toBe(false);
  });
});

describe('rankStandings', () => {
  it('ranks on achieved value, breaking ties on attainment then name', () => {
    const ranked = rankStandings([
      standing('Anurag Singh', 200_000, 2000),
      standing('Ravinder Jain', 500_000, 6700),
      standing('Aman Shaikh', 300_000, 4000),
    ]);
    expect(ranked.map((row) => [row.name, row.rank])).toEqual([
      ['Ravinder Jain', 1],
      ['Aman Shaikh', 2],
      ['Anurag Singh', 3],
    ]);
  });

  it('gives tied rows the same rank and skips the next (1, 2, 2, 4)', () => {
    const ranked = rankStandings([
      standing('Dev', 100, 1000),
      standing('Asha', 300, 3000),
      standing('Bala', 200, 2000),
      standing('Chitra', 200, 2000),
    ]);
    expect(ranked.map((row) => [row.name, row.rank])).toEqual([
      ['Asha', 1],
      ['Bala', 2],
      ['Chitra', 2],
      ['Dev', 4],
    ]);
  });

  it('sorts a null attainment below a scored one at the same value', () => {
    const ranked = rankStandings([standing('Zoya', 500, null), standing('Amit', 500, 100)]);
    expect(ranked.map((row) => row.name)).toEqual(['Amit', 'Zoya']);
    expect(ranked.map((row) => row.rank)).toEqual([1, 2]);
  });

  it('does not mutate its input', () => {
    const rows = [standing('Bala', 200, 2000), standing('Asha', 300, 3000)];
    rankStandings(rows);
    expect(rows.map((row) => row.name)).toEqual(['Bala', 'Asha']);
  });
});

describe('podium', () => {
  it('returns second, first, third in draw order', () => {
    const ranked = rankStandings([
      standing('Ravinder', 500, 5000),
      standing('Aman', 300, 3000),
      standing('Anurag', 200, 2000),
      standing('Priya', 100, 1000),
    ]);
    expect(podium(ranked).map((row) => row.name)).toEqual(['Aman', 'Ravinder', 'Anurag']);
  });

  it('drops the empty places when fewer than three are ranked', () => {
    expect(podium([]).length).toBe(0);
    expect(podium(rankStandings([standing('Solo', 10, 1000)])).map((row) => row.name)).toEqual([
      'Solo',
    ]);
    expect(
      podium(rankStandings([standing('A', 20, 2000), standing('B', 10, 1000)])).map(
        (row) => row.name,
      ),
    ).toEqual(['B', 'A']);
  });
});

describe('buildInsights', () => {
  it('accumulates a running total and per-day average', () => {
    const rows = buildInsights([
      { date: '2026-09-01', value: 100 },
      { date: '2026-09-02', value: 0 },
      { date: '2026-09-03', value: 50 },
    ]);
    expect(rows).toEqual([
      { date: '2026-09-01', value: 100, cumulative: 100, runningAverage: 100 },
      { date: '2026-09-02', value: 0, cumulative: 100, runningAverage: 50 },
      { date: '2026-09-03', value: 50, cumulative: 150, runningAverage: 50 },
    ]);
  });

  it('rounds to two places instead of trailing float noise', () => {
    const rows = buildInsights([
      { date: '2026-09-01', value: 10 },
      { date: '2026-09-02', value: 10 },
      { date: '2026-09-03', value: 10 },
    ]);
    expect(rows[2].runningAverage).toBe(10);
    expect(buildInsights([{ date: '2026-09-01', value: 1 / 3 }])[0].value).toBe(0.33);
  });

  it('returns nothing for an empty period', () => {
    expect(buildInsights([])).toEqual([]);
  });
});

describe('dailyAverage', () => {
  it('divides by elapsed days and treats a period that has not opened as zero', () => {
    expect(dailyAverage(90_000, 14)).toBe(6428.57);
    expect(dailyAverage(500, 0)).toBe(0);
    expect(dailyAverage(0, 10)).toBe(0);
  });
});

describe('suggestionsFor', () => {
  // 90K of 150K with only 6 of 30 days left: 10,000/day is needed, well above
  // the 3,600/day booked so far.
  const behind = computeAchievement({
    achievedValue: 90_000,
    targetValue: 150_000,
    periodStart: '2026-09-01',
    periodEnd: '2026-09-30',
    today: '2026-09-25',
  });

  it('names the daily average to move to when behind pace', () => {
    const [first] = suggestionsFor({
      achievement: behind,
      dailyAverage: 3600,
      followUpCompletionBps: 9500,
      visitCompletionBps: 9500,
    });
    expect(first.code).toBe('raise_daily_average');
    expect(first.detail).toContain(String(behind.dailyRequired));
  });

  it('flags weak visit and follow-up rates with both ends of the move', () => {
    const codes = suggestionsFor({
      achievement: behind,
      dailyAverage: 99_999,
      followUpCompletionBps: 6000,
      visitCompletionBps: 7300,
    });
    expect(codes.map((row) => row.code)).toEqual(['raise_visit_rate', 'raise_follow_up_rate']);
    expect(codes[0].detail).toBe('Increase daily visit completion from 73% to 90%.');
  });

  it('caps the card at three suggestions', () => {
    const closing = computeAchievement({
      achievedValue: 10,
      targetValue: 150_000,
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
      today: '2026-09-29',
    });
    expect(
      suggestionsFor({
        achievement: closing,
        dailyAverage: 1,
        followUpCompletionBps: 1000,
        visitCompletionBps: 1000,
      }),
    ).toHaveLength(3);
  });

  it('falls back to holding the pace when nothing is lagging', () => {
    const met = computeAchievement({
      achievedValue: 150_000,
      targetValue: 150_000,
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
      today: '2026-09-14',
    });
    const [only] = suggestionsFor({
      achievement: met,
      dailyAverage: 10_714,
      followUpCompletionBps: null,
      visitCompletionBps: null,
    });
    expect(only.code).toBe('hold_pace');
    expect(only.detail).toContain('Target met');
  });
});

describe('paceNote', () => {
  it('reads ON TRACK when the forecast still lands the target', () => {
    const note = paceNote(
      computeAchievement({
        achievedValue: 80_000,
        targetValue: 150_000,
        periodStart: '2026-09-01',
        periodEnd: '2026-09-30',
        today: '2026-09-14',
      }),
    );
    expect(note.status).toBe('on_track');
    expect(note.title).toBe('ON TRACK');
  });

  it('reads TRAILING with the daily rate that clears the balance', () => {
    const note = paceNote(
      computeAchievement({
        achievedValue: 20_000,
        targetValue: 150_000,
        periodStart: '2026-09-01',
        periodEnd: '2026-09-30',
        today: '2026-09-25',
      }),
    );
    expect(note.status).toBe('trailing');
    expect(note.detail).toContain('per day clears the balance');
  });

  it('says the period closed when there are no days left to recover in', () => {
    const note = paceNote(
      computeAchievement({
        achievedValue: 20_000,
        targetValue: 150_000,
        periodStart: '2026-08-01',
        periodEnd: '2026-08-31',
        today: '2026-09-14',
      }),
    );
    expect(note.status).toBe('trailing');
    expect(note.detail).toBe('The period has closed below target.');
  });
});

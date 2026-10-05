import {
  bandFor,
  buildCalendarMonth,
  eachDay,
  gridRange,
  isMonthKey,
  monthBounds,
  weekdayOf,
} from './follow-up-calendar';

const TZ = 'Asia/Kolkata';

describe('month keys', () => {
  it('accepts YYYY-MM and rejects anything else', () => {
    expect(isMonthKey('2026-02')).toBe(true);
    expect(isMonthKey('2026-12')).toBe(true);
    expect(isMonthKey('2026-13')).toBe(false);
    expect(isMonthKey('2026-00')).toBe(false);
    expect(isMonthKey('2026-2')).toBe(false);
    expect(isMonthKey('2026-02-01')).toBe(false);
    expect(() => monthBounds('2026-13')).toThrow('Invalid month');
  });

  it('snaps to the first and last day, leap year included', () => {
    expect(monthBounds('2026-02')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    expect(monthBounds('2028-02')).toEqual({ start: '2028-02-01', end: '2028-02-29' });
    expect(monthBounds('2026-12')).toEqual({ start: '2026-12-01', end: '2026-12-31' });
  });
});

describe('grid range', () => {
  it('starts on the Sunday on or before the first and always spans six weeks', () => {
    // 2026-02-01 is a Sunday, so the grid opens on the first itself.
    expect(weekdayOf('2026-02-01')).toBe(0);
    expect(gridRange('2026-02')).toEqual({ start: '2026-02-01', end: '2026-03-14' });

    // 2026-09-01 is a Tuesday: the grid backs up to Sunday 2026-08-30.
    expect(weekdayOf('2026-09-01')).toBe(2);
    expect(gridRange('2026-09')).toEqual({ start: '2026-08-30', end: '2026-10-10' });
  });

  it('paints exactly 42 cells whichever month it is', () => {
    for (const month of ['2026-01', '2026-02', '2026-09', '2028-02']) {
      const { start, end } = gridRange(month);
      expect(eachDay(start, end)).toHaveLength(42);
    }
  });
});

describe('bandFor', () => {
  const now = new Date('2026-09-21T06:00:00.000Z');

  it('separates overdue from still-due on the due instant', () => {
    expect(bandFor({ dueAt: new Date('2026-09-21T05:59:59.000Z'), status: 'pending' }, now)).toBe(
      'overdue',
    );
    expect(bandFor({ dueAt: new Date('2026-09-21T06:00:01.000Z'), status: 'pending' }, now)).toBe(
      'due',
    );
  });

  it('keeps a finished follow-up out of the overdue band however old it is', () => {
    const old = new Date('2026-01-01T00:00:00.000Z');
    expect(bandFor({ dueAt: old, status: 'completed' }, now)).toBe('completed');
    expect(bandFor({ dueAt: old, status: 'cancelled' }, now)).toBe('cancelled');
    expect(bandFor({ dueAt: old, status: 'skipped' }, now)).toBe('cancelled');
  });
});

describe('buildCalendarMonth', () => {
  const now = new Date('2026-09-21T06:00:00.000Z'); // 11:30 on the 21st in IST

  function build(entries: Array<{ dueAt: string; status: string }>) {
    return buildCalendarMonth({
      month: '2026-09',
      timeZone: TZ,
      now,
      entries: entries.map((entry) => ({ dueAt: new Date(entry.dueAt), status: entry.status })),
    });
  }

  it('reports the month, grid and today in the tenant zone', () => {
    const board = build([]);
    expect(board.month).toBe('2026-09');
    expect(board.today).toBe('2026-09-21');
    expect(board.monthStart).toBe('2026-09-01');
    expect(board.monthEnd).toBe('2026-09-30');
    expect(board.days).toHaveLength(42);
    expect(board.totals).toEqual({ total: 0, overdue: 0, due: 0, completed: 0, cancelled: 0 });
  });

  it('marks which cells belong to the month and which is today', () => {
    const board = build([]);
    const lead = board.days.find((day) => day.date === '2026-08-30');
    const first = board.days.find((day) => day.date === '2026-09-01');
    const today = board.days.find((day) => day.date === '2026-09-21');
    expect(lead?.inMonth).toBe(false);
    expect(first?.inMonth).toBe(true);
    expect(today?.isToday).toBe(true);
    expect(board.days.filter((day) => day.isToday)).toHaveLength(1);
  });

  it('counts each band onto the day the follow-up is due', () => {
    const board = build([
      { dueAt: '2026-09-20T04:00:00.000Z', status: 'pending' }, // past → overdue
      { dueAt: '2026-09-20T05:00:00.000Z', status: 'completed' },
      { dueAt: '2026-09-22T04:00:00.000Z', status: 'pending' }, // future → due
      { dueAt: '2026-09-22T05:00:00.000Z', status: 'cancelled' },
    ]);
    const twentieth = board.days.find((day) => day.date === '2026-09-20');
    const twentySecond = board.days.find((day) => day.date === '2026-09-22');
    expect(twentieth).toMatchObject({ total: 2, overdue: 1, completed: 1, band: 'overdue' });
    expect(twentySecond).toMatchObject({ total: 2, due: 1, cancelled: 1, band: 'due' });
    expect(board.totals).toEqual({ total: 4, overdue: 1, due: 1, completed: 1, cancelled: 1 });
  });

  it('bands a day by its most urgent work', () => {
    const completedOnly = build([{ dueAt: '2026-09-10T05:00:00.000Z', status: 'completed' }]);
    expect(completedOnly.days.find((day) => day.date === '2026-09-10')?.band).toBe('completed');

    const cancelledOnly = build([{ dueAt: '2026-09-10T05:00:00.000Z', status: 'cancelled' }]);
    expect(cancelledOnly.days.find((day) => day.date === '2026-09-10')?.band).toBe('cancelled');

    const quiet = build([]);
    expect(quiet.days.find((day) => day.date === '2026-09-10')?.band).toBeNull();
  });

  it('buckets on the tenant zone, not UTC', () => {
    // 19:00 UTC on the 21st is 00:30 on the 22nd in IST.
    const board = build([{ dueAt: '2026-09-21T19:00:00.000Z', status: 'pending' }]);
    expect(board.days.find((day) => day.date === '2026-09-21')?.total).toBe(0);
    expect(board.days.find((day) => day.date === '2026-09-22')?.total).toBe(1);
  });

  it('counts the leading and trailing cells the grid actually shows', () => {
    const board = build([{ dueAt: '2026-08-30T05:00:00.000Z', status: 'pending' }]);
    const lead = board.days.find((day) => day.date === '2026-08-30');
    expect(lead).toMatchObject({ inMonth: false, total: 1, overdue: 1 });
    expect(board.totals.total).toBe(1);
  });

  it('ignores entries that fall outside the painted grid', () => {
    const board = build([{ dueAt: '2026-05-05T05:00:00.000Z', status: 'pending' }]);
    expect(board.totals.total).toBe(0);
  });
});

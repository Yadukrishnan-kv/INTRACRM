import {
  addDaysYmd,
  dayStatus,
  durationMinutes,
  eachYmd,
  lateAfterLabel,
  resolvePunchOutAt,
  workDateYmd,
} from './attendance-types';

describe('attendance helpers', () => {
  it('formats work dates and ranges', () => {
    expect(workDateYmd(new Date('2026-08-18T04:30:00.000Z'))).toBe('2026-08-18');
    expect(addDaysYmd('2026-08-18', 1)).toBe('2026-08-19');
    expect(eachYmd('2026-08-17', '2026-08-18')).toEqual(['2026-08-17', '2026-08-18']);
    expect(lateAfterLabel()).toBe('10:15');
  });

  it('classifies a day and never punches out before punch in', () => {
    const morning = new Date('2026-08-18T03:00:00.000Z');
    expect(dayStatus({ firstInAt: morning, hasOpen: false })).toBe('present');
    expect(dayStatus({ firstInAt: morning, hasOpen: true })).toBe('open');
    expect(dayStatus({ firstInAt: null, hasOpen: false })).toBe('absent');
    expect(durationMinutes(morning, new Date('2026-08-18T12:00:00.000Z'))).toBe(540);
    const futureIn = new Date('2026-08-22T12:00:00.000Z');
    const now = new Date('2026-08-18T10:00:00.000Z');
    expect(resolvePunchOutAt(futureIn, now)).toEqual(futureIn);
  });
});

import {
  changedLeadFields,
  parseEstimatedValueMinor,
  parseLeadPhone,
  toMinorNumber,
} from './lead-validation';

describe('parseLeadPhone', () => {
  it('accepts E.164 and 10-digit Indian mobiles', () => {
    expect(parseLeadPhone('+14155552671')).toEqual({ ok: true, value: '+14155552671' });
    expect(parseLeadPhone('9876543210')).toEqual({ ok: true, value: '+919876543210' });
    expect(parseLeadPhone('91 98765 43210')).toEqual({ ok: true, value: '+919876543210' });
    expect(parseLeadPhone('')).toEqual({ ok: true, value: null });
    expect(parseLeadPhone('123')).toEqual({ ok: false });
  });

  it('accepts international numbers in common formats', () => {
    expect(parseLeadPhone('+1 (415) 555-2671')).toEqual({ ok: true, value: '+14155552671' });
    expect(parseLeadPhone('+44 20 7946 0958')).toEqual({ ok: true, value: '+442079460958' });
    expect(parseLeadPhone('0044 20 7946 0958')).toEqual({ ok: true, value: '+442079460958' });
    expect(parseLeadPhone('+971 50 123 4567')).toEqual({ ok: true, value: '+971501234567' });
  });

  it('rejects garbage input', () => {
    expect(parseLeadPhone('not a phone number')).toEqual({ ok: false });
    expect(parseLeadPhone('+1')).toEqual({ ok: false });
  });
});

describe('parseEstimatedValueMinor', () => {
  it('truncates and keeps null', () => {
    expect(parseEstimatedValueMinor(150050)).toBe(150050);
    expect(parseEstimatedValueMinor(10.9)).toBe(10);
    expect(parseEstimatedValueMinor(null)).toBeNull();
  });
});

describe('toMinorNumber', () => {
  it('converts bigint for JSON', () => {
    expect(toMinorNumber(150000n)).toBe(150000);
    expect(toMinorNumber(null)).toBeNull();
  });
});

describe('changedLeadFields', () => {
  it('lists keys that differ', () => {
    expect(
      changedLeadFields(
        { title: 'A', quality: 'hot', city: null },
        { title: 'B', quality: 'hot', city: 'Pune' },
      ),
    ).toEqual(['title', 'city']);
  });
});

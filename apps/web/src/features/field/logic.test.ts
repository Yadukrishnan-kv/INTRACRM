import { describe, expect, it } from 'vitest';
import {
  defaultAttendanceRange,
  formatMinutes,
  geoLabel,
  isOverdue,
  parseVisitFilter,
  photoContentType,
  photoProblem,
  shiftYmd,
  toCreateVisitBody,
  validateRange,
  validateVisitDraft,
  visitActions,
  visitAddress,
  visitFilterQuery,
  visitTitle,
  type VisitDraft,
} from './logic';

const draft = (over: Partial<VisitDraft> = {}): VisitDraft => ({
  leadId: 'lead-1',
  scheduledAt: '2026-10-14T05:30:00.000Z',
  purpose: '',
  notes: '',
  addressLine1: '',
  city: '',
  state: '',
  postalCode: '',
  assignedToMembershipId: '',
  location: null,
  ...over,
});

describe('visit filters', () => {
  it('defaults to scheduled like mobile', () => {
    expect(parseVisitFilter(null)).toBe('scheduled');
    expect(parseVisitFilter('junk')).toBe('scheduled');
    expect(parseVisitFilter('overdue')).toBe('overdue');
  });
  it('maps to list query', () => {
    expect(visitFilterQuery('all')).toEqual({});
    expect(visitFilterQuery('overdue')).toEqual({ overdue: true });
    expect(visitFilterQuery('in_progress')).toEqual({ status: 'in_progress' });
  });
});

describe('visit display', () => {
  it('title falls back from purpose to lead to customer', () => {
    expect(visitTitle({ purpose: 'Measure', leadTitle: 'L', customerName: 'C' })).toBe('Measure');
    expect(visitTitle({ purpose: '  ', leadTitle: null, customerName: 'C' })).toBe('C');
    expect(visitTitle({ purpose: null, leadTitle: null, customerName: null })).toBe('Site visit');
  });
  it('address joins non-empty parts', () => {
    expect(visitAddress({ addressLine1: '1 Main', city: 'Kochi', state: ' ', postalCode: null })).toBe('1 Main, Kochi');
  });
  it('overdue only for past scheduled visits', () => {
    const now = new Date('2026-10-13T10:00:00Z');
    expect(isOverdue({ status: 'scheduled', scheduledAt: '2026-10-13T09:00:00Z' }, now)).toBe(true);
    expect(isOverdue({ status: 'in_progress', scheduledAt: '2026-10-13T09:00:00Z' }, now)).toBe(false);
    expect(isOverdue({ status: 'scheduled', scheduledAt: '2026-10-13T11:00:00Z' }, now)).toBe(false);
  });
  it('geo label', () => {
    expect(geoLabel(null)).toBe('—');
    expect(geoLabel({ latitude: 9.9312, longitude: 76.2673, accuracyMeters: 12.4 })).toBe('9.93120, 76.26730 (±12 m)');
  });
});

describe('visit actions', () => {
  it('scheduled can check in, not out', () => {
    const a = visitActions('scheduled', true);
    expect(a).toMatchObject({ checkIn: true, checkOut: false, complete: true, cancel: true, noShow: true, capture: true });
  });
  it('in progress can check out', () => {
    expect(visitActions('in_progress', true)).toMatchObject({ checkIn: false, checkOut: true, noShow: false });
  });
  it('closed visits and missing permission allow nothing', () => {
    expect(Object.values(visitActions('completed', true)).some(Boolean)).toBe(false);
    expect(Object.values(visitActions('scheduled', false)).some(Boolean)).toBe(false);
  });
});

describe('visit draft', () => {
  it('requires lead and time', () => {
    expect(validateVisitDraft(draft({ leadId: '', scheduledAt: '' }))).toEqual({
      leadId: 'Select a lead.',
      scheduledAt: 'Pick a date and time.',
    });
  });
  it('checks length limits', () => {
    expect(validateVisitDraft(draft({ purpose: 'x'.repeat(161) })).purpose).toBeDefined();
    expect(validateVisitDraft(draft())).toEqual({});
  });
  it('builds a trimmed body without blanks', () => {
    expect(toCreateVisitBody(draft({ city: ' Kochi ', purpose: ' ' }))).toEqual({
      leadId: 'lead-1',
      scheduledAt: '2026-10-14T05:30:00.000Z',
      purpose: undefined,
      notes: undefined,
      addressLine1: undefined,
      city: 'Kochi',
      state: undefined,
      postalCode: undefined,
      assignedToMembershipId: undefined,
      scheduledLocation: undefined,
    });
  });
});

describe('photos', () => {
  it('detects content type', () => {
    expect(photoContentType({ type: 'image/jpg', name: 'a.jpg' })).toBe('image/jpeg');
    expect(photoContentType({ type: '', name: 'a.PNG' })).toBe('image/png');
    expect(photoContentType({ type: 'image/gif', name: 'a.gif' })).toBeNull();
  });
  it('rejects too many, wrong type and too large', () => {
    expect(photoProblem({ type: 'image/png', name: 'a', size: 10 }, 12)).toMatch(/at most/);
    expect(photoProblem({ type: 'image/gif', name: 'a', size: 10 }, 0)).toMatch(/JPEG/);
    expect(photoProblem({ type: 'image/png', name: 'a', size: 6 * 1024 * 1024 }, 0)).toMatch(/5 MB/);
    expect(photoProblem({ type: 'image/png', name: 'a', size: 10 }, 0)).toBeNull();
  });
});

describe('attendance', () => {
  it('formats minutes', () => {
    expect(formatMinutes(0)).toBe('0m');
    expect(formatMinutes(45)).toBe('45m');
    expect(formatMinutes(125)).toBe('2h 5m');
  });
  it('shifts dates across months', () => {
    expect(shiftYmd('2026-10-01', -1)).toBe('2026-09-30');
    expect(shiftYmd('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('default range is 14 days ending today', () => {
    expect(defaultAttendanceRange(new Date(2026, 9, 13))).toEqual({ from: '2026-09-30', to: '2026-10-13' });
  });
  it('validates ranges', () => {
    expect(validateRange('2026-10-01', '2026-10-13')).toBeNull();
    expect(validateRange('2026-10-13', '2026-10-01')).toMatch(/after/);
    expect(validateRange('', '2026-10-01')).toMatch(/both/);
    expect(validateRange('2026-01-01', '2026-10-01')).toMatch(/92/);
  });
});

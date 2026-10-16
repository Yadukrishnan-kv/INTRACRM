import { describe, expect, it } from 'vitest';
import {
  chunkWeeks,
  defaultSelectedDay,
  longDate,
  monthLabel,
  notificationLink,
  parseListFilter,
  shiftMonth,
  toListParams,
  validateFollowUpForm,
  type FollowUpFormValues,
} from './logic';
import type { CalendarDay } from './types';

describe('list filter', () => {
  it('defaults to pending like mobile', () => {
    const f = parseListFilter(new URLSearchParams(''));
    expect(f.view).toBe('pending');
    expect(toListParams(f)).toEqual({ status: 'pending' });
  });

  it('bucket clears the status chip', () => {
    const f = parseListFilter(new URLSearchParams('bucket=today&type=call'));
    expect(toListParams(f)).toEqual({ bucket: 'today', type: 'call' });
  });

  it('overdue view and date range', () => {
    const f = parseListFilter(new URLSearchParams('view=overdue&dueFrom=2026-10-01&dueTo=2026-10-31&assignee=abc'));
    expect(toListParams(f)).toEqual({ overdue: true, dueFrom: '2026-10-01', dueTo: '2026-10-31', assignedToMembershipId: 'abc' });
  });

  it('dueOn overrides the range and junk is ignored', () => {
    const f = parseListFilter(new URLSearchParams('view=all&dueOn=2026-10-13&dueFrom=2026-10-01&type=fax&bucket=nope'));
    expect(toListParams(f)).toEqual({ dueOn: '2026-10-13' });
  });

  it('no_follow_up is not sent to the list endpoint', () => {
    const f = parseListFilter(new URLSearchParams('bucket=no_follow_up'));
    expect(f.bucket).toBe('no_follow_up');
    expect(toListParams(f)).toEqual({});
  });
});

describe('validateFollowUpForm', () => {
  const now = new Date('2026-10-13T10:00:00');
  const base: FollowUpFormValues = { leadId: 'l1', type: 'call', title: '', dueAt: '2026-10-14T10:00', remindAt: '', priority: '', notes: '' };

  it('accepts a minimal create', () => {
    expect(validateFollowUpForm(base, 'create', now)).toEqual({});
  });

  it('requires lead and due date on create', () => {
    const e = validateFollowUpForm({ ...base, leadId: '', dueAt: '' }, 'create', now);
    expect(e.leadId).toBeTruthy();
    expect(e.dueAt).toBeTruthy();
  });

  it('rejects past due, late reminder, short title', () => {
    const e = validateFollowUpForm({ ...base, dueAt: '2026-10-12T10:00', title: 'x' }, 'create', now);
    expect(e.dueAt).toBeTruthy();
    expect(e.title).toBeTruthy();
    const r = validateFollowUpForm({ ...base, remindAt: '2026-10-15T10:00' }, 'create', now);
    expect(r.remindAt).toBeTruthy();
  });

  it('edit ignores lead and due', () => {
    expect(validateFollowUpForm({ ...base, leadId: '', dueAt: '' }, 'edit', now)).toEqual({});
  });
});

describe('calendar helpers', () => {
  it('shifts months across years', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-10', 0)).toBe('2026-10');
  });

  it('labels', () => {
    expect(monthLabel('2026-10')).toBe('October 2026');
    expect(longDate('2026-10-03')).toBe('Oct 3, 2026');
  });

  it('default day', () => {
    expect(defaultSelectedDay({ today: '2026-10-13', monthStart: '2026-10-01', monthEnd: '2026-10-31' })).toBe('2026-10-13');
    expect(defaultSelectedDay({ today: '2026-10-13', monthStart: '2026-11-01', monthEnd: '2026-11-30' })).toBe('2026-11-01');
  });

  it('chunks 42 days into 6 weeks', () => {
    const days = Array.from({ length: 42 }, (_, i) => ({ date: String(i) }) as CalendarDay);
    const weeks = chunkWeeks(days);
    expect(weeks).toHaveLength(6);
    expect(weeks[5]?.[6]?.date).toBe('41');
  });
});

describe('notificationLink', () => {
  it('maps resources', () => {
    expect(notificationLink('follow_up', 'a')).toBe('/tasks/a');
    expect(notificationLink('lead', 'b')).toBe('/leads/b');
    expect(notificationLink('quotation', 'c')).toBe('/quotations/c');
    expect(notificationLink('other', 'd')).toBeNull();
    expect(notificationLink('lead', ' ')).toBeNull();
  });
});

describe('unreadIds', () => {
  it('keeps only notifications without readAt', async () => {
    const { unreadIds } = await import('./logic');
    expect(
      unreadIds([
        { id: 'a', readAt: null },
        { id: 'b', readAt: '2026-01-01T00:00:00Z' },
        { id: 'c', readAt: null },
      ]),
    ).toEqual(['a', 'c']);
  });
});

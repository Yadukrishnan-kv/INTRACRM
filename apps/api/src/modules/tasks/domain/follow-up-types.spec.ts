import {
  defaultTitleForType,
  followUpCatalog,
  isOverdueFollowUp,
  isPendingFollowUp,
  titleForFollowUpType,
} from './follow-up-types';

describe('follow-up types', () => {
  it('covers Call, WhatsApp, Visit, and Meeting', () => {
    expect(followUpCatalog()).toEqual([
      { code: 'call', title: 'Call' },
      { code: 'whatsapp', title: 'WhatsApp' },
      { code: 'visit', title: 'Visit' },
      { code: 'meeting', title: 'Meeting' },
    ]);
  });

  it('defaults titles from type when none is given', () => {
    expect(defaultTitleForType('whatsapp')).toBe('WhatsApp');
    expect(defaultTitleForType('visit', '  Site check  ')).toBe('Site check');
    expect(titleForFollowUpType('unknown')).toBe('Follow-up');
  });

  it('treats overdue as pending past due_at', () => {
    const due = new Date('2026-01-01T00:00:00.000Z');
    const now = new Date('2026-01-02T00:00:00.000Z');
    expect(isOverdueFollowUp('pending', due, now)).toBe(true);
    expect(isOverdueFollowUp('completed', due, now)).toBe(false);
    expect(isPendingFollowUp('pending')).toBe(true);
    expect(isPendingFollowUp('cancelled')).toBe(false);
  });
});

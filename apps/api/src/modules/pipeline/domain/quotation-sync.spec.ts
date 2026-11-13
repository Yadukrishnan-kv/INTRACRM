import { findTargetStage, quotationStageTarget, shouldAdvanceLead } from './quotation-sync';

const stage = (sortOrder: number, flags: { isWon?: boolean; isLost?: boolean } = {}) => ({
  sortOrder,
  isWon: flags.isWon ?? false,
  isLost: flags.isLost ?? false,
});

describe('quotationStageTarget', () => {
  it('maps quotation statuses to pipeline stages', () => {
    expect(quotationStageTarget('sent')).toBe('quotation');
    expect(quotationStageTarget('follow_up')).toBe('quotation');
    expect(quotationStageTarget('customer_deciding')).toBe('quotation');
    expect(quotationStageTarget('negotiation')).toBe('negotiation');
    expect(quotationStageTarget('approved')).toBe('negotiation');
    expect(quotationStageTarget('won')).toBe('won');
  });

  it('never moves the lead for draft or lost quotations', () => {
    expect(quotationStageTarget('draft')).toBeNull();
    expect(quotationStageTarget('lost')).toBeNull();
  });
});

describe('shouldAdvanceLead', () => {
  it('moves an open lead forward only', () => {
    expect(shouldAdvanceLead({ lifecycleStatus: 'open', stageSortOrder: 30 }, stage(50))).toBe(true);
    expect(shouldAdvanceLead({ lifecycleStatus: 'open', stageSortOrder: 60 }, stage(50))).toBe(false);
    expect(shouldAdvanceLead({ lifecycleStatus: 'open', stageSortOrder: 50 }, stage(50))).toBe(false);
  });

  it('leaves won/lost leads alone for non-final moves', () => {
    expect(shouldAdvanceLead({ lifecycleStatus: 'lost', stageSortOrder: 80 }, stage(50))).toBe(false);
    expect(shouldAdvanceLead({ lifecycleStatus: 'won', stageSortOrder: 70 }, stage(60))).toBe(false);
  });

  it('an accepted quotation closes any not-yet-won lead as Won', () => {
    expect(shouldAdvanceLead({ lifecycleStatus: 'open', stageSortOrder: 50 }, stage(70, { isWon: true }))).toBe(true);
    expect(shouldAdvanceLead({ lifecycleStatus: 'lost', stageSortOrder: 80 }, stage(70, { isWon: true }))).toBe(true);
    expect(shouldAdvanceLead({ lifecycleStatus: 'won', stageSortOrder: 70 }, stage(70, { isWon: true }))).toBe(false);
  });

  it('never auto-moves into Lost', () => {
    expect(shouldAdvanceLead({ lifecycleStatus: 'open', stageSortOrder: 10 }, stage(80, { isLost: true }))).toBe(false);
  });
});

describe('findTargetStage', () => {
  const stages = [
    { code: 'quotation', isWon: false },
    { code: 'negotiation', isWon: false },
    { code: 'closed_won', isWon: true },
  ];
  it('finds Won by flag and others by code', () => {
    expect(findTargetStage(stages, 'won')?.code).toBe('closed_won');
    expect(findTargetStage(stages, 'negotiation')?.code).toBe('negotiation');
    expect(findTargetStage([], 'quotation')).toBeUndefined();
  });
});

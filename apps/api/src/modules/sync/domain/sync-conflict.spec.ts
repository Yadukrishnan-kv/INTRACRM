import {
  mergeFollowUpConflict,
  mergeLeadConflict,
  mergeNotes,
  SERVER_WINS_LEAD_FIELDS,
} from './sync-conflict';

describe('offline conflict resolution', () => {
  it('keeps server ownership and stage, and merges safe lead fields', () => {
    const merged = mergeLeadConflict(
      {
        title: 'Local title',
        city: 'Pune',
        ownerMembershipId: 'local-owner',
        lifecycleStatus: 'open',
        stageName: 'New',
      },
      {
        title: 'Server title',
        city: 'Mumbai',
        ownerMembershipId: 'server-owner',
        lifecycleStatus: 'won',
        stageName: 'Closed',
        version: 4,
        updatedAt: '2026-08-17T00:00:00.000Z',
      },
    );
    expect(merged.title).toBe('Local title');
    expect(merged.city).toBe('Pune');
    expect(merged.ownerMembershipId).toBe('server-owner');
    expect(merged.lifecycleStatus).toBe('won');
    expect(merged.stageName).toBe('Closed');
    expect(merged.version).toBe(4);
    expect(SERVER_WINS_LEAD_FIELDS).toContain('ownerMembershipId');
  });

  it('lets a completed follow-up win and otherwise merges notes', () => {
    expect(
      mergeFollowUpConflict(
        { notes: 'Called', status: 'pending', version: 1 },
        { notes: 'Email sent', status: 'completed', version: 3 },
      ).status,
    ).toBe('completed');
    expect(mergeNotes('Email sent', 'Called')).toBe('Email sent\nCalled');
  });
});

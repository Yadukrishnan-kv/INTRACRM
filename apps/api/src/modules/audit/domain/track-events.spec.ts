import { TRACK_ACTION, isTrackAction, summarizeTracks } from './track-events';

describe('track catalog', () => {
  it('covers create, update, delete, assignments, and status changes', () => {
    expect(Object.values(TRACK_ACTION)).toEqual([
      'create',
      'update',
      'delete',
      'assign',
      'status_change',
    ]);
    expect(isTrackAction('assign')).toBe(true);
    expect(isTrackAction('reassign')).toBe(false);
  });
});

describe('summarizeTracks', () => {
  it('rolls up actions, resources, and actors', () => {
    const report = summarizeTracks(
      [
        {
          action: 'create',
          resourceType: 'lead',
          actorId: 'u1',
          actorName: 'Asha',
          createdAt: new Date('2026-08-16T10:00:00.000Z'),
        },
        {
          action: 'assign',
          resourceType: 'lead',
          actorId: 'u1',
          actorName: 'Asha',
          createdAt: new Date('2026-08-16T11:00:00.000Z'),
        },
        {
          action: 'status_change',
          resourceType: 'quotation',
          actorId: 'u2',
          actorName: 'Ravi',
          createdAt: new Date('2026-08-17T09:00:00.000Z'),
        },
        {
          action: 'delete',
          resourceType: 'lead',
          actorId: null,
          actorName: null,
          createdAt: new Date('2026-08-17T12:00:00.000Z'),
        },
      ],
      new Date('2026-08-17T13:00:00.000Z'),
    );
    expect(report.totals).toEqual({
      total: 4,
      create: 1,
      update: 0,
      delete: 1,
      assign: 1,
      statusChange: 1,
    });
    expect(report.byResource[0]).toEqual({ resourceType: 'lead', count: 3 });
    expect(report.byActor[0]?.name).toBe('Asha');
    expect(report.byDay.map((row) => row.date)).toEqual(['2026-08-16', '2026-08-17']);
  });
});

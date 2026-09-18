import {
  canCancel,
  canCaptureField,
  canCheckIn,
  canCheckOut,
  canComplete,
  canMarkNoShow,
  isAllowedPhotoType,
  isValidGeoPoint,
  resolveCheckOutAt,
} from './site-visit-types';
import { summarizeSiteVisits } from './site-visit-report';

describe('site visit transitions', () => {
  it('allows field capture only while scheduled or in progress', () => {
    expect(canCheckIn('scheduled')).toBe(true);
    expect(canCheckOut('in_progress')).toBe(true);
    expect(canCaptureField('scheduled')).toBe(true);
    expect(canComplete('in_progress')).toBe(true);
    expect(canCancel('scheduled')).toBe(true);
    expect(canMarkNoShow('scheduled')).toBe(true);
    expect(canCheckIn('completed')).toBe(false);
    expect(canCaptureField('cancelled')).toBe(false);
    expect(canMarkNoShow('in_progress')).toBe(false);
  });

  it('does not set check-out earlier than check-in', () => {
    const checkIn = new Date('2026-08-22T12:00:00.000Z');
    const now = new Date('2026-08-18T10:00:00.000Z');
    expect(resolveCheckOutAt(checkIn, now)).toEqual(checkIn);
    const later = new Date('2026-08-22T15:00:00.000Z');
    expect(resolveCheckOutAt(checkIn, later)).toEqual(later);
  });

  it('validates GPS and photo types', () => {
    expect(isValidGeoPoint({ latitude: 19.07, longitude: 72.87 })).toBe(true);
    expect(isValidGeoPoint({ latitude: 91, longitude: 72 })).toBe(false);
    expect(isAllowedPhotoType('image/jpeg')).toBe(true);
    expect(isAllowedPhotoType('application/pdf')).toBe(false);
  });
});

describe('site visit report', () => {
  it('counts GPS, photos, feedback, and assignee totals', () => {
    const report = summarizeSiteVisits(
      [
        {
          status: 'completed',
          assignedToMembershipId: 'm1',
          assigneeName: 'Asha',
          checkInLat: 19.1,
          customerRating: 5,
          customerFeedback: 'Good visit',
          photoCount: 2,
        },
        {
          status: 'scheduled',
          assignedToMembershipId: 'm1',
          assigneeName: 'Asha',
          checkInLat: null,
          customerRating: null,
          customerFeedback: null,
          photoCount: 0,
        },
        {
          status: 'no_show',
          assignedToMembershipId: 'm2',
          assigneeName: 'Ravi',
          checkInLat: null,
          customerRating: null,
          customerFeedback: null,
          photoCount: 0,
        },
      ],
      new Date('2026-08-16T12:00:00.000Z'),
    );
    expect(report.totals).toEqual({
      total: 3,
      scheduled: 1,
      inProgress: 0,
      completed: 1,
      cancelled: 0,
      noShow: 1,
      withGps: 1,
      withPhotos: 1,
      withFeedback: 1,
      averageRating: 5,
    });
    expect(report.byAssignee[0]).toMatchObject({
      membershipId: 'm1',
      total: 2,
      completed: 1,
      withGps: 1,
      averageRating: 5,
    });
  });
});

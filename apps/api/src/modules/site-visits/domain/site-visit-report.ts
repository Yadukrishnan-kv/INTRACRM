import { SITE_VISIT_STATUSES, SiteVisitStatusCode } from './site-visit-types';

export type SiteVisitReportInput = {
  status: string;
  assignedToMembershipId: string;
  assigneeName: string | null;
  checkInLat: number | null;
  customerRating: number | null;
  customerFeedback: string | null;
  photoCount: number;
};

export type SiteVisitReportView = {
  generatedAt: string;
  totals: {
    total: number;
    scheduled: number;
    inProgress: number;
    completed: number;
    cancelled: number;
    noShow: number;
    withGps: number;
    withPhotos: number;
    withFeedback: number;
    averageRating: number | null;
  };
  byStatus: Array<{ status: string; count: number }>;
  byAssignee: Array<{
    membershipId: string;
    name: string | null;
    total: number;
    completed: number;
    noShow: number;
    withGps: number;
    averageRating: number | null;
  }>;
};

const emptyStatusCounts = (): Record<SiteVisitStatusCode, number> => ({
  scheduled: 0,
  in_progress: 0,
  completed: 0,
  cancelled: 0,
  no_show: 0,
});

export function summarizeSiteVisits(
  rows: SiteVisitReportInput[],
  generatedAt = new Date(),
): SiteVisitReportView {
  const counts = emptyStatusCounts();
  let withGps = 0;
  let withPhotos = 0;
  let withFeedback = 0;
  let ratingSum = 0;
  let ratingCount = 0;
  const byAssignee = new Map<
    string,
    {
      membershipId: string;
      name: string | null;
      total: number;
      completed: number;
      noShow: number;
      withGps: number;
      ratingSum: number;
      ratingCount: number;
    }
  >();

  for (const row of rows) {
    if ((SITE_VISIT_STATUSES as readonly string[]).includes(row.status)) {
      counts[row.status as SiteVisitStatusCode] += 1;
    }
    if (row.checkInLat != null) {
      withGps += 1;
    }
    if (row.photoCount > 0) {
      withPhotos += 1;
    }
    if (row.customerFeedback || row.customerRating != null) {
      withFeedback += 1;
    }
    if (row.customerRating != null) {
      ratingSum += row.customerRating;
      ratingCount += 1;
    }
    const current = byAssignee.get(row.assignedToMembershipId) ?? {
      membershipId: row.assignedToMembershipId,
      name: row.assigneeName,
      total: 0,
      completed: 0,
      noShow: 0,
      withGps: 0,
      ratingSum: 0,
      ratingCount: 0,
    };
    current.total += 1;
    if (row.status === 'completed') {
      current.completed += 1;
    }
    if (row.status === 'no_show') {
      current.noShow += 1;
    }
    if (row.checkInLat != null) {
      current.withGps += 1;
    }
    if (row.customerRating != null) {
      current.ratingSum += row.customerRating;
      current.ratingCount += 1;
    }
    byAssignee.set(row.assignedToMembershipId, current);
  }

  return {
    generatedAt: generatedAt.toISOString(),
    totals: {
      total: rows.length,
      scheduled: counts.scheduled,
      inProgress: counts.in_progress,
      completed: counts.completed,
      cancelled: counts.cancelled,
      noShow: counts.no_show,
      withGps,
      withPhotos,
      withFeedback,
      averageRating: ratingCount === 0 ? null : Math.round((ratingSum / ratingCount) * 10) / 10,
    },
    byStatus: SITE_VISIT_STATUSES.map((status) => ({ status, count: counts[status] })),
    byAssignee: [...byAssignee.values()]
      .map((row) => ({
        membershipId: row.membershipId,
        name: row.name,
        total: row.total,
        completed: row.completed,
        noShow: row.noShow,
        withGps: row.withGps,
        averageRating:
          row.ratingCount === 0 ? null : Math.round((row.ratingSum / row.ratingCount) * 10) / 10,
      }))
      .sort((a, b) => b.total - a.total || a.membershipId.localeCompare(b.membershipId)),
  };
}

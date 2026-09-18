export const SITE_VISIT_STATUSES = [
  'scheduled',
  'in_progress',
  'completed',
  'cancelled',
  'no_show',
] as const;

export type SiteVisitStatusCode = (typeof SITE_VISIT_STATUSES)[number];

export const SITE_VISIT_STATUS_LABELS: Record<SiteVisitStatusCode, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No show',
};

export const MAX_SITE_VISIT_PHOTOS = 12;
export const MAX_SITE_VISIT_PHOTO_BYTES = 5 * 1024 * 1024;
export const SITE_VISIT_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type GeoPoint = {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
};

export function siteVisitCatalog() {
  return {
    statuses: SITE_VISIT_STATUSES.map((code) => ({
      code,
      label: SITE_VISIT_STATUS_LABELS[code],
    })),
    maxPhotos: MAX_SITE_VISIT_PHOTOS,
    maxPhotoBytes: MAX_SITE_VISIT_PHOTO_BYTES,
    photoContentTypes: [...SITE_VISIT_PHOTO_TYPES],
  };
}

export function isOpenSiteVisit(status: string): boolean {
  return status === 'scheduled' || status === 'in_progress';
}

export function canCheckIn(status: string): boolean {
  return status === 'scheduled';
}

export function canCheckOut(status: string): boolean {
  return status === 'in_progress';
}

/** Postgres chk_site_visits_times requires checkout >= check-in. */
export function resolveCheckOutAt(checkedInAt: Date | null | undefined, now = new Date()): Date {
  if (checkedInAt && checkedInAt.getTime() > now.getTime()) {
    return checkedInAt;
  }
  return now;
}

export function canCaptureField(status: string): boolean {
  return isOpenSiteVisit(status);
}

export function canComplete(status: string): boolean {
  return isOpenSiteVisit(status);
}

export function canCancel(status: string): boolean {
  return isOpenSiteVisit(status);
}

export function canMarkNoShow(status: string): boolean {
  return status === 'scheduled';
}

export function isValidLatitude(value: number): boolean {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

export function isValidLongitude(value: number): boolean {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

export function isValidGeoPoint(point: GeoPoint): boolean {
  return isValidLatitude(point.latitude) && isValidLongitude(point.longitude);
}

export function photoExtension(contentType: string): string {
  switch (contentType) {
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    default:
      return 'jpg';
  }
}

export function isAllowedPhotoType(contentType: string): boolean {
  return (SITE_VISIT_PHOTO_TYPES as readonly string[]).includes(contentType);
}

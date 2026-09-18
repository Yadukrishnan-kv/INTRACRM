import { Prisma } from '@prisma/client';

export type GeoView = {
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
};

export type SiteVisitPhotoView = {
  id: string;
  caption: string | null;
  contentType: string;
  byteSize: number;
  capturedAt: string;
  location: GeoView | null;
  sortOrder: number;
};

export type SiteVisitView = {
  id: string;
  status: string;
  purpose: string | null;
  notes: string | null;
  outcome: string | null;
  scheduledAt: string;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  scheduledLocation: GeoView | null;
  checkInLocation: GeoView | null;
  checkOutLocation: GeoView | null;
  customerFeedback: string | null;
  customerRating: number | null;
  feedbackCapturedAt: string | null;
  photoCount: number;
  photos: SiteVisitPhotoView[];
  assignedToMembershipId: string;
  assigneeName: string | null;
  leadId: string;
  leadNumber: string | null;
  leadTitle: string | null;
  customerName: string | null;
  version: number;
};

type DecimalLike = Prisma.Decimal | number | null | undefined;

export type SiteVisitMappedRow = {
  id: string;
  status: string;
  purpose: string | null;
  notes: string | null;
  outcome: string | null;
  scheduledAt: Date;
  checkedInAt: Date | null;
  checkedOutAt: Date | null;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  scheduledLat: DecimalLike;
  scheduledLng: DecimalLike;
  checkInLat: DecimalLike;
  checkInLng: DecimalLike;
  checkInAccuracyM: DecimalLike;
  checkOutLat: DecimalLike;
  checkOutLng: DecimalLike;
  checkOutAccuracyM: DecimalLike;
  customerFeedback: string | null;
  customerRating: number | null;
  feedbackCapturedAt: Date | null;
  assignedToMembershipId: string;
  version: number;
  leadId?: string;
  assignee?: { user: { fullName: string } } | null;
  lead?: {
    id: string;
    leadNumber: string;
    title: string;
    customerName: string | null;
  } | null;
  photos?: Array<{
    id: string;
    caption: string | null;
    capturedAt: Date;
    capturedLat: DecimalLike;
    capturedLng: DecimalLike;
    capturedAccuracyM: DecimalLike;
    sortOrder: number;
    deletedAt: Date | null;
    file: { contentType: string; byteSize: bigint };
  }>;
  _count?: { photos: number };
};

function toCoord(value: DecimalLike): number | null {
  if (value == null) {
    return null;
  }
  return Number(value);
}

function toGeo(
  lat: DecimalLike,
  lng: DecimalLike,
  accuracy?: DecimalLike,
): GeoView | null {
  const latitude = toCoord(lat);
  const longitude = toCoord(lng);
  if (latitude == null || longitude == null) {
    return null;
  }
  return {
    latitude,
    longitude,
    accuracyMeters: toCoord(accuracy ?? null),
  };
}

export function toSiteVisitView(row: SiteVisitMappedRow): SiteVisitView {
  const livePhotos = (row.photos ?? []).filter((photo) => photo.deletedAt == null);
  return {
    id: row.id,
    status: row.status,
    purpose: row.purpose,
    notes: row.notes,
    outcome: row.outcome,
    scheduledAt: row.scheduledAt.toISOString(),
    checkedInAt: row.checkedInAt?.toISOString() ?? null,
    checkedOutAt: row.checkedOutAt?.toISOString() ?? null,
    addressLine1: row.addressLine1,
    city: row.city,
    state: row.state,
    postalCode: row.postalCode,
    scheduledLocation: toGeo(row.scheduledLat, row.scheduledLng),
    checkInLocation: toGeo(row.checkInLat, row.checkInLng, row.checkInAccuracyM),
    checkOutLocation: toGeo(row.checkOutLat, row.checkOutLng, row.checkOutAccuracyM),
    customerFeedback: row.customerFeedback,
    customerRating: row.customerRating,
    feedbackCapturedAt: row.feedbackCapturedAt?.toISOString() ?? null,
    photoCount: livePhotos.length || row._count?.photos || 0,
    photos: livePhotos.map((photo) => ({
      id: photo.id,
      caption: photo.caption,
      contentType: photo.file.contentType,
      byteSize: Number(photo.file.byteSize),
      capturedAt: photo.capturedAt.toISOString(),
      location: toGeo(photo.capturedLat, photo.capturedLng, photo.capturedAccuracyM),
      sortOrder: photo.sortOrder,
    })),
    assignedToMembershipId: row.assignedToMembershipId,
    assigneeName: row.assignee?.user.fullName ?? null,
    leadId: row.lead?.id ?? row.leadId ?? '',
    leadNumber: row.lead?.leadNumber ?? null,
    leadTitle: row.lead?.title ?? null,
    customerName: row.lead?.customerName ?? null,
    version: row.version,
  };
}

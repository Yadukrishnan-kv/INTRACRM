import { Prisma } from '@prisma/client';
import { durationMinutes } from '../domain/attendance-types';

type DecimalLike = Prisma.Decimal | number | null | undefined;

export type GeoView = {
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
};

export type AttendanceSessionView = {
  id: string;
  membershipId: string;
  staffName: string | null;
  workDate: string;
  punchedInAt: string;
  punchedOutAt: string | null;
  inLocation: GeoView | null;
  outLocation: GeoView | null;
  minutesWorked: number;
  status: 'open' | 'closed';
  notes: string | null;
  version: number;
};

export type AttendanceMappedRow = {
  id: string;
  membershipId: string;
  workDate: Date;
  punchedInAt: Date;
  punchedOutAt: Date | null;
  inLat: DecimalLike;
  inLng: DecimalLike;
  inAccuracyM: DecimalLike;
  outLat: DecimalLike;
  outLng: DecimalLike;
  outAccuracyM: DecimalLike;
  notes: string | null;
  version: number;
  membership?: { user?: { fullName: string } | null } | null;
};

function toCoord(value: DecimalLike): number | null {
  if (value == null) {
    return null;
  }
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function toGeo(lat: DecimalLike, lng: DecimalLike, accuracy?: DecimalLike): GeoView | null {
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

export function toSessionView(row: AttendanceMappedRow, now = new Date()): AttendanceSessionView {
  const closed = row.punchedOutAt != null;
  return {
    id: row.id,
    membershipId: row.membershipId,
    staffName: row.membership?.user?.fullName ?? null,
    workDate: row.workDate.toISOString().slice(0, 10),
    punchedInAt: row.punchedInAt.toISOString(),
    punchedOutAt: row.punchedOutAt?.toISOString() ?? null,
    inLocation: toGeo(row.inLat, row.inLng, row.inAccuracyM),
    outLocation: toGeo(row.outLat, row.outLng, row.outAccuracyM),
    minutesWorked: durationMinutes(row.punchedInAt, row.punchedOutAt ?? now),
    status: closed ? 'closed' : 'open',
    notes: row.notes,
    version: row.version,
  };
}

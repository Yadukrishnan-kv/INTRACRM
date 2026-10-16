import { getPosition } from '../../lib/hooks';
import type { GeoPoint } from './types';

export type LocateResult = { ok: true; point: GeoPoint } | { ok: false; message: string };

/**
 * Browser equivalent of the mobile DeviceLocation.current(). Uses getPosition()
 * and, when it fails, explains why (blocked permission vs. no fix).
 */
export async function locate(): Promise<LocateResult> {
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return { ok: false, message: 'Location needs a secure (https) connection. Open the console over https and try again.' };
  }
  if (!('geolocation' in navigator)) {
    return { ok: false, message: 'This browser cannot share your location. Use a browser with location support.' };
  }
  const pos = await getPosition();
  if (pos) {
    return { ok: true, point: { latitude: pos.latitude, longitude: pos.longitude, accuracyMeters: Math.round(pos.accuracy) } };
  }
  let denied = false;
  try {
    const status = await navigator.permissions?.query({ name: 'geolocation' });
    denied = status?.state === 'denied';
  } catch {
    // Permissions API unsupported; fall through to the generic message.
  }
  return {
    ok: false,
    message: denied
      ? 'Location access is blocked for this site. Allow location in your browser’s site settings, then try again.'
      : 'Could not get your location. Turn on location services (and allow this site) and try again.',
  };
}

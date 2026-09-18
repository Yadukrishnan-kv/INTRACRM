export function devicesMatch(boundDeviceId: string | null | undefined, presented?: string | null): boolean {
  if (!boundDeviceId || !presented) {
    return false;
  }
  return boundDeviceId === presented;
}

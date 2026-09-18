import { devicesMatch } from './device-binding';

describe('device binding', () => {
  it('requires the presented device to match the session device', () => {
    expect(devicesMatch('device-a', 'device-a')).toBe(true);
    expect(devicesMatch('device-a', 'device-b')).toBe(false);
    expect(devicesMatch('device-a', undefined)).toBe(false);
    expect(devicesMatch(null, 'device-a')).toBe(false);
  });
});

export type Session = {
  accessToken: string;
  refreshToken: string;
  sessionId: string | null;
  tenantId: string;
  user: { id: string; fullName: string; email: string };
};

const SESSION_KEY = 'intra.session';
const DEVICE_KEY = 'intra.deviceId';

// Tokens live in sessionStorage so they survive a reload but not the tab;
// the device id is per-browser and stable, because the API binds sessions to it.
function safeGet(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(storage: Storage, key: string, value: string | null): void {
  try {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, value);
  } catch {
    // Storage blocked (private mode, policy); the session stays in memory only.
  }
}

let current: Session | null = (() => {
  const raw = safeGet(sessionStorage, SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
})();

const listeners = new Set<(session: Session | null) => void>();

export const sessionStore = {
  get(): Session | null {
    return current;
  },
  set(session: Session | null): void {
    current = session;
    safeSet(sessionStorage, SESSION_KEY, session ? JSON.stringify(session) : null);
    listeners.forEach((listener) => listener(session));
  },
  subscribe(listener: (session: Session | null) => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

let memoryDeviceId: string | null = null;

export function deviceId(): string {
  const stored = safeGet(localStorage, DEVICE_KEY);
  if (stored) return stored;
  memoryDeviceId ??= `web-${crypto.randomUUID()}`;
  safeSet(localStorage, DEVICE_KEY, memoryDeviceId);
  return memoryDeviceId;
}

export function deviceName(): string {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Chrome\//.test(ua)
      ? 'Chrome'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Browser';
  return `Web console (${browser})`;
}

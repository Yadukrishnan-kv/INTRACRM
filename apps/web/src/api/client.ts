import { deviceId, sessionStore, type Session } from '../auth/session';

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '/api/v1').replace(/\/$/, '');

export type PageMeta = {
  limit: number;
  hasMore: boolean;
  nextCursor: string | null;
  prevCursor: string | null;
};

export type ApiResult<T> = { data: T; page: PageMeta | null };

type FieldError = { field?: string; code?: string; message?: string };

/** RFC 7807 problem details as returned by the API's AllExceptionsFilter. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly title: string,
    readonly detail: string | null,
    readonly errors: FieldError[] = [],
  ) {
    super(detail ?? title);
    this.name = 'ApiError';
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  query?: Record<string, string | number | undefined | null>;
  body?: unknown;
  signal?: AbortSignal;
};

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const NO_REFRESH = ['/auth/login', '/auth/refresh', '/auth/forgot-password', '/auth/reset-password'];

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = `${API_BASE_URL}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

async function toApiError(response: Response): Promise<ApiError> {
  let body: Record<string, unknown> = {};
  try {
    body = (await response.json()) as Record<string, unknown>;
  } catch {
    // Non-JSON error (proxy, gateway); fall through with the status alone.
  }
  return new ApiError(
    response.status,
    typeof body.code === 'string' ? body.code : `HTTP_${response.status}`,
    typeof body.title === 'string' ? body.title : response.statusText || 'Request failed',
    typeof body.detail === 'string' ? body.detail : null,
    Array.isArray(body.errors) ? (body.errors as FieldError[]) : [],
  );
}

async function send(path: string, options: RequestOptions, session: Session | null): Promise<Response> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Request-Id': crypto.randomUUID(),
    'X-Device-Id': deviceId(),
  };
  if (session) {
    headers.Authorization = `Bearer ${session.accessToken}`;
    headers['X-Tenant-Id'] = session.tenantId;
  }
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (UNSAFE.has(method) && path !== '/auth/refresh') headers['Idempotency-Key'] = crypto.randomUUID();

  return fetch(buildUrl(path, options.query), {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });
}

type TokenPayload = {
  accessToken: string;
  refreshToken: string;
  sessionId?: string;
  tenantId: string;
  user?: { id: string; fullName: string; email: string };
};

export function sessionFromTokens(payload: TokenPayload, previous?: Session | null): Session {
  return {
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken,
    sessionId: payload.sessionId ?? previous?.sessionId ?? null,
    tenantId: payload.tenantId ?? previous?.tenantId ?? '',
    user: payload.user ?? previous?.user ?? { id: '', fullName: '', email: '' },
  };
}

// One refresh at a time: concurrent 401s all wait on the same rotation, since
// the API treats a reused refresh token as theft (REFRESH_REUSE).
let refreshing: Promise<Session | null> | null = null;

function refreshSession(stale: Session): Promise<Session | null> {
  refreshing ??= (async () => {
    try {
      const response = await send(
        '/auth/refresh',
        { method: 'POST', body: { refreshToken: stale.refreshToken, deviceId: deviceId() } },
        null,
      );
      if (!response.ok) return null;
      const json = (await response.json()) as { data: TokenPayload };
      const next = sessionFromTokens(json.data, stale);
      sessionStore.set(next);
      return next;
    } catch {
      return null;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
  const session = sessionStore.get();
  let response = await send(path, options, session);

  if (response.status === 401 && session && !NO_REFRESH.some((p) => path.startsWith(p))) {
    const error = await toApiError(response.clone());
    if (error.code === 'DEVICE_MISMATCH') {
      sessionStore.set(null);
      throw error;
    }
    // Another request may already have rotated the tokens while this one was in flight.
    const latest = sessionStore.get();
    const fresh =
      latest && latest.accessToken !== session.accessToken ? latest : await refreshSession(session);
    if (!fresh) {
      sessionStore.set(null);
      throw error;
    }
    response = await send(path, options, fresh);
  }

  if (!response.ok) throw await toApiError(response);
  if (response.status === 204) return { data: undefined as T, page: null };

  const json = (await response.json()) as { data: T; meta?: { page?: PageMeta } };
  return { data: json.data, page: json.meta?.page ?? null };
}

/**
 * Authenticated binary fetch (PDF, Excel, QR, photos). Goes through the same
 * header + refresh path as `request`, but returns the raw Blob.
 */
export async function requestBlob(
  path: string,
  options: Omit<RequestOptions, 'body'> & { body?: unknown } = {},
): Promise<{ blob: Blob; filename: string | null }> {
  const session = sessionStore.get();
  let response = await send(path, options, session);
  if (response.status === 401 && session) {
    const fresh = await refreshSession(session);
    if (!fresh) {
      sessionStore.set(null);
      throw await toApiError(response);
    }
    response = await send(path, options, fresh);
  }
  if (!response.ok) throw await toApiError(response);
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  return { blob: await response.blob(), filename: match?.[1] ? decodeURIComponent(match[1]) : null };
}

/** Fetches a file and hands it to the browser as a download. */
export async function downloadFile(
  path: string,
  fallbackName: string,
  query?: RequestOptions['query'],
): Promise<void> {
  const { blob, filename } = await requestBlob(path, { query });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename ?? fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Reads a File as a base64 string (no data: prefix) for JSON upload bodies. */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Field-level messages from a VALIDATION_ERROR, keyed by field name. */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError)) return {};
  const out: Record<string, string> = {};
  for (const e of error.errors) {
    if (e.field && !out[e.field]) out[e.field] = e.message ?? 'Invalid value';
  }
  return out;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.detail ?? error.title;
  if (error instanceof Error) return error.message;
  return 'Something went wrong.';
}

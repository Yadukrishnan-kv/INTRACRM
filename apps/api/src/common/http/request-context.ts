import { AsyncLocalStorage } from 'node:async_hooks';

export type RequestContextStore = {
  requestId: string;
  tenantId?: string;
  userId?: string;
  membershipId?: string;
  roles?: string[];
  permissions?: string[];
  deviceId?: string;
  path: string;
  method: string;
};

export const requestContextStorage = new AsyncLocalStorage<RequestContextStore>();

export function getRequestContext(): RequestContextStore | undefined {
  return requestContextStorage.getStore();
}

export function getRequestId(): string | undefined {
  return getRequestContext()?.requestId;
}

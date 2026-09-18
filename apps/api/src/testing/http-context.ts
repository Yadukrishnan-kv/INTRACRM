import { ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { AuthUser } from '../common/auth/current-user.decorator';

type HeaderMap = Record<string, string | undefined>;

export type FakeRequest = Request & { user?: AuthUser };

export type FakeResponse = {
  statusCode: number;
  headers: Record<string, unknown>;
  getHeader: (name: string) => unknown;
  setHeader: (name: string, value: unknown) => FakeResponse;
  status: jest.Mock;
  json: jest.Mock;
};

export function createRequest(partial: {
  method?: string;
  path?: string;
  originalUrl?: string;
  headers?: HeaderMap;
  user?: AuthUser;
  ip?: string;
  body?: unknown;
}): FakeRequest {
  const headers: HeaderMap = {};
  for (const [key, value] of Object.entries(partial.headers ?? {})) {
    headers[key.toLowerCase()] = value;
  }
  const request = {
    method: partial.method ?? 'GET',
    path: partial.path ?? '/',
    originalUrl: partial.originalUrl ?? partial.path ?? '/',
    ip: partial.ip ?? '127.0.0.1',
    body: partial.body,
    socket: { remoteAddress: partial.ip ?? '127.0.0.1' },
    header(name: string) {
      return headers[name.toLowerCase()];
    },
    ...(partial.user ? { user: partial.user } : {}),
  };
  return request as FakeRequest;
}

export function createResponse(): FakeResponse {
  const headers: Record<string, unknown> = {};
  const response = {
    statusCode: 200,
    headers,
    getHeader(name: string) {
      return headers[name.toLowerCase()];
    },
    setHeader(name: string, value: unknown) {
      headers[name.toLowerCase()] = value;
      return response;
    },
    status: jest.fn(),
    json: jest.fn(),
  } as FakeResponse;
  response.status.mockImplementation((code: number) => {
    response.statusCode = code;
    return response;
  });
  response.json.mockImplementation((body: unknown) => body);
  return response;
}

export function httpContext(partial: {
  method?: string;
  path?: string;
  originalUrl?: string;
  headers?: HeaderMap;
  user?: AuthUser;
  ip?: string;
  response?: FakeResponse;
}): ExecutionContext {
  const request = createRequest(partial);
  const response = partial.response ?? createResponse();
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
    getHandler: () => function handler() {},
    getClass: () => class TestController {},
  } as unknown as ExecutionContext;
}

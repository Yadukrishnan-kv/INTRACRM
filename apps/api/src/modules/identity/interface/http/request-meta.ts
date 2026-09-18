import { Request } from 'express';

export type RequestMeta = {
  ip?: string;
  userAgent?: string;
  deviceId?: string;
};

export function requestMeta(req: Request): RequestMeta {
  const forwarded = req.header('x-forwarded-for');
  const forwardedIp = forwarded?.split(',')[0]?.trim();
  const ip = forwardedIp || req.ip || req.socket.remoteAddress;
  const userAgent = req.header('user-agent');
  const deviceId = req.header('x-device-id')?.trim();
  return {
    ...(ip ? { ip } : {}),
    ...(userAgent ? { userAgent } : {}),
    ...(deviceId ? { deviceId } : {}),
  };
}

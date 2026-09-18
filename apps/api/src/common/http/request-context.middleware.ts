import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { v7 as uuidv7 } from 'uuid';
import { HttpHeaders } from './http-headers';
import { requestContextStorage } from './request-context';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incomingId = req.header(HttpHeaders.requestId);
    const requestId =
      incomingId && incomingId.trim().length > 0 ? incomingId.trim() : uuidv7();
    const tenantId = req.header(HttpHeaders.tenantId);
    const deviceId = req.header(HttpHeaders.deviceId);

    res.setHeader(HttpHeaders.requestId, requestId);

    requestContextStorage.run(
      {
        requestId,
        path: req.originalUrl,
        method: req.method,
        ...(tenantId ? { tenantId } : {}),
        ...(deviceId ? { deviceId } : {}),
      },
      () => next(),
    );
  }
}

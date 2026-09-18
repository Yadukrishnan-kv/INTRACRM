import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, map } from 'rxjs';
import { PageMetaDto, successResponse } from '../dto/api-response';
import { getRequestId } from '../http/request-context';

type EnvelopeInput<T> = {
  data: T;
  page?: PageMetaDto;
};

function isEnvelopeInput(value: unknown): value is EnvelopeInput<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'data' in value &&
    !('meta' in value)
  );
}

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    if (this.shouldSkip(request, response)) {
      return next.handle();
    }

    return next.handle().pipe(
      map((body: unknown) => {
        if (response.statusCode === 204 || body === undefined) {
          return body;
        }
        const requestId = getRequestId() ?? 'unknown';
        if (isEnvelopeInput(body)) {
          return successResponse(body.data, requestId, body.page);
        }
        return successResponse(body, requestId);
      }),
    );
  }

  private shouldSkip(request: Request, response: Response): boolean {
    const url = request.originalUrl.split('?')[0] ?? '';
    return (
      url.includes('/health') ||
      url.includes('/docs') ||
      this.isPublicWarrantyPage(url) ||
      this.isReportExport(url) ||
      response.getHeader('content-type') === 'text/event-stream'
    );
  }

  private isPublicWarrantyPage(url: string): boolean {
    if (!url.includes('/public/warranty')) {
      return false;
    }
    return (
      /\/public\/warranty\/?$/.test(url) ||
      url.endsWith('/portal.js') ||
      url.endsWith('/jsqr.js') ||
      url.endsWith('/view') ||
      url.endsWith('/pdf')
    );
  }

  private isReportExport(url: string): boolean {
    return url.includes('/reports/') && url.endsWith('/export');
  }
}

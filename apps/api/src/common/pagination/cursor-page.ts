import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PageMetaDto } from '../dto/api-response';

export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;

export class CursorPageQueryDto {
  @ApiPropertyOptional({ description: 'Opaque cursor from the previous page' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ default: DEFAULT_PAGE_LIMIT, maximum: MAX_PAGE_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_LIMIT)
  limit?: number = DEFAULT_PAGE_LIMIT;
}

export function buildPageMeta(params: {
  limit: number;
  hasMore: boolean;
  nextCursor?: string | null;
  prevCursor?: string | null;
}): PageMetaDto {
  return {
    limit: params.limit,
    hasMore: params.hasMore,
    nextCursor: params.nextCursor ?? null,
    prevCursor: params.prevCursor ?? null,
  };
}

export function encodeCursor(payload: Record<string, string>): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): Record<string, string> {
  const raw = Buffer.from(cursor, 'base64url').toString('utf8');
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Invalid cursor');
  }
  return parsed as Record<string, string>;
}

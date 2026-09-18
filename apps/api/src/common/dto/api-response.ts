import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PageMetaDto {
  @ApiPropertyOptional({ nullable: true, type: String })
  nextCursor!: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  prevCursor!: string | null;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  hasMore!: boolean;
}

export class ResponseMetaDto {
  @ApiProperty()
  requestId!: string;

  @ApiProperty({ example: '2026-08-15T11:14:00Z' })
  timestamp!: string;

  @ApiPropertyOptional({ type: PageMetaDto })
  page?: PageMetaDto;
}

export class ApiSuccessResponse<T> {
  data!: T;
  meta!: ResponseMetaDto;
}

export function successResponse<T>(
  data: T,
  requestId: string,
  page?: PageMetaDto,
): ApiSuccessResponse<T> {
  return {
    data,
    meta: {
      requestId,
      timestamp: new Date().toISOString(),
      ...(page ? { page } : {}),
    },
  };
}

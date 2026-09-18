import { Transform, Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export const SYNC_LIMITS = {
  defaultLimit: 100,
  maxLimit: 200,
} as const;

export class SyncQueryDto {
  @ApiPropertyOptional({ description: 'ISO-8601 timestamp from the previous sync cursor' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  )
  @IsDateString()
  updatedSince?: string;

  @ApiPropertyOptional({ default: SYNC_LIMITS.defaultLimit, maximum: SYNC_LIMITS.maxLimit })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(SYNC_LIMITS.maxLimit)
  limit?: number;
}

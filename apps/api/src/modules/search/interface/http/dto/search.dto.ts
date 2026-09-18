import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SEARCH_FIELDS, SEARCH_LIMITS } from '../../../domain/search-query';

export class SearchQueryDto {
  @ApiProperty()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  q!: string;

  @ApiPropertyOptional({ enum: SEARCH_FIELDS })
  @IsOptional()
  @IsIn([...SEARCH_FIELDS])
  by?: (typeof SEARCH_FIELDS)[number];

  @ApiPropertyOptional({ default: SEARCH_LIMITS.defaultLimit, maximum: SEARCH_LIMITS.maxLimit })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(SEARCH_LIMITS.maxLimit)
  limit?: number;
}

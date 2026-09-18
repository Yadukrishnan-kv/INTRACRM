import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class PipelineBoardQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  pipelineId?: string;

  @ApiPropertyOptional({ default: 50, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;
}

export class ChangeStageRequest {
  @ApiProperty()
  @IsUUID()
  stageId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(240)
  reason?: string;

  @ApiPropertyOptional({ description: 'Required when moving to Lost' })
  @IsOptional()
  @IsUUID()
  lostReasonId?: string;

  @ApiPropertyOptional({ description: 'Lead version for optimistic concurrency' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version?: number;
}

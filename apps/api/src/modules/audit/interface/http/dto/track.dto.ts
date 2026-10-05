import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsUUID } from 'class-validator';
import { CursorPageQueryDto } from '../../../../../common/pagination/cursor-page';
import { TRACK_ACTIONS, TRACK_RESOURCES } from '../../../domain/track-events';

export class TrackListQuery extends CursorPageQueryDto {
  @ApiPropertyOptional({ enum: TRACK_ACTIONS })
  @IsOptional()
  @IsIn([...TRACK_ACTIONS])
  action?: (typeof TRACK_ACTIONS)[number];

  @ApiPropertyOptional({ enum: TRACK_RESOURCES })
  @IsOptional()
  @IsIn([...TRACK_RESOURCES])
  resourceType?: (typeof TRACK_RESOURCES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  resourceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class TrackReportQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ enum: TRACK_ACTIONS })
  @IsOptional()
  @IsIn([...TRACK_ACTIONS])
  action?: (typeof TRACK_ACTIONS)[number];

  @ApiPropertyOptional({ enum: TRACK_RESOURCES })
  @IsOptional()
  @IsIn([...TRACK_RESOURCES])
  resourceType?: (typeof TRACK_RESOURCES)[number];
}

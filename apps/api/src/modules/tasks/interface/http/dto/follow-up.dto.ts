import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { CursorPageQueryDto } from '../../../../../common/pagination/cursor-page';
import {
  FOLLOW_UP_STATUSES,
  FOLLOW_UP_TYPES,
} from '../../../domain/follow-up-types';

export class FollowUpListQuery extends CursorPageQueryDto {
  @ApiPropertyOptional({ enum: FOLLOW_UP_STATUSES })
  @IsOptional()
  @IsIn([...FOLLOW_UP_STATUSES])
  status?: (typeof FOLLOW_UP_STATUSES)[number];

  @ApiPropertyOptional({ enum: FOLLOW_UP_TYPES })
  @IsOptional()
  @IsIn([...FOLLOW_UP_TYPES])
  type?: (typeof FOLLOW_UP_TYPES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  leadId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assignedToMembershipId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === 'true' || value === 1 || value === '1') {
      return true;
    }
    if (value === false || value === 'false' || value === 0 || value === '0') {
      return false;
    }
    return undefined;
  })
  @IsBoolean()
  overdue?: boolean;

  @ApiPropertyOptional({ enum: ['overdue', 'today', 'upcoming'] })
  @IsOptional()
  @IsIn(['overdue', 'today', 'upcoming'])
  bucket?: 'overdue' | 'today' | 'upcoming';
}

export class CreateFollowUpRequest {
  @ApiProperty()
  @IsUUID()
  leadId!: string;

  @ApiProperty({ enum: FOLLOW_UP_TYPES })
  @IsIn([...FOLLOW_UP_TYPES])
  type!: (typeof FOLLOW_UP_TYPES)[number];

  @ApiProperty()
  @IsDateString()
  dueAt!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  remindAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3)
  priority?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assignedToMembershipId?: string;
}

export class UpdateFollowUpRequest {
  @ApiPropertyOptional({ enum: FOLLOW_UP_TYPES })
  @IsOptional()
  @IsIn([...FOLLOW_UP_TYPES])
  type?: (typeof FOLLOW_UP_TYPES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3)
  priority?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assignedToMembershipId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version?: number;
}

export class RescheduleFollowUpRequest {
  @ApiProperty()
  @IsDateString()
  dueAt!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  remindAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version?: number;
}

export class CompleteFollowUpRequest {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version?: number;
}

export class FollowUpReportQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assignedToMembershipId?: string;
}

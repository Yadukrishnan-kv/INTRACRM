import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NOTIFICATION_EVENT_CODES, PUSH_PLATFORMS } from '../../../domain/notification-events';

export class RegisterDevicePushTokenRequest {
  @ApiProperty()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  deviceId!: string;

  @ApiProperty({ enum: PUSH_PLATFORMS })
  @IsIn([...PUSH_PLATFORMS])
  platform!: (typeof PUSH_PLATFORMS)[number];

  @ApiProperty()
  @IsString()
  @MinLength(16)
  @MaxLength(4096)
  token!: string;
}

export class UpdateNotificationPreferenceRequest {
  @ApiProperty({ enum: NOTIFICATION_EVENT_CODES })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsIn([...NOTIFICATION_EVENT_CODES])
  eventType!: (typeof NOTIFICATION_EVENT_CODES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  inAppEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  pushEnabled?: boolean;
}

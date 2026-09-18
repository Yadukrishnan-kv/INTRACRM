import { Transform } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MESSAGE_TEMPLATE_CHANNELS } from '../../../domain/comms';

export class CommsTemplateQuery {
  @ApiPropertyOptional({ enum: MESSAGE_TEMPLATE_CHANNELS })
  @IsOptional()
  @IsIn([...MESSAGE_TEMPLATE_CHANNELS])
  channel?: (typeof MESSAGE_TEMPLATE_CHANNELS)[number];
}

export class CreateMessageTemplateRequest {
  @ApiProperty({ enum: MESSAGE_TEMPLATE_CHANNELS })
  @IsIn([...MESSAGE_TEMPLATE_CHANNELS])
  channel!: (typeof MESSAGE_TEMPLATE_CHANNELS)[number];

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  @Matches(/^[a-z][a-z0-9_]*$/)
  code!: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  body!: string;
}

export class UpdateMessageTemplateRequest {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  body?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === true || value === 'true')
  isActive?: boolean;
}

export class SendCallRequest {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class SendMessageRequest {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  templateCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  body?: string;
}

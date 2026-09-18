import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AUTH_POLICY, PASSWORD_RULE } from '../../../domain/password.policy';

export class LoginRequest {
  @ApiProperty()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  password!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  deviceId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  deviceName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  tenantId?: string;
}

export class RefreshRequest {
  @ApiProperty()
  @IsString()
  @MinLength(20)
  refreshToken!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  deviceId?: string;
}

export class ForgotPasswordRequest {
  @ApiProperty()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email!: string;
}

export class ResetPasswordRequest {
  @ApiProperty()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(6)
  @MaxLength(6)
  otp!: string;

  @ApiProperty()
  @IsString()
  @MinLength(AUTH_POLICY.minPasswordLength)
  @Matches(PASSWORD_RULE, {
    message: 'Password must include at least one letter and one number.',
  })
  newPassword!: string;
}

export class ChangePasswordRequest {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  currentPassword!: string;

  @ApiProperty()
  @IsString()
  @MinLength(AUTH_POLICY.minPasswordLength)
  @Matches(PASSWORD_RULE, {
    message: 'Password must include at least one letter and one number.',
  })
  newPassword!: string;
}

export class LogoutRequest {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

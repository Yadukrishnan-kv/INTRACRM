import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AppConfig } from '../../common/config/configuration';
import { AuthService } from './application/auth.service';
import { RbacService } from './application/rbac.service';
import { AuthRateLimiter } from './infrastructure/auth.rate-limiter';
import { PasswordHasher } from './infrastructure/password.hasher';
import { TokenHasher } from './infrastructure/token.hasher';
import { AuthController } from './interface/http/auth.controller';
import { MeController } from './interface/http/me.controller';
import { RbacController } from './interface/http/rbac.controller';
import { SessionsController } from './interface/http/sessions.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    NotificationsModule,
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const jwt = config.get('jwt', { infer: true });
        return {
          secret: jwt.accessSecret,
          signOptions: {
            expiresIn: `${jwt.accessTtlSeconds}s`,
            issuer: 'intra-leads',
            audience: 'intra-leads-mobile',
          },
          verifyOptions: {
            issuer: 'intra-leads',
            audience: 'intra-leads-mobile',
          },
        };
      },
    }),
  ],
  controllers: [AuthController, SessionsController, MeController, RbacController],
  providers: [AuthService, RbacService, PasswordHasher, TokenHasher, AuthRateLimiter],
  exports: [AuthService, RbacService, JwtModule],
})
export class IdentityModule {}

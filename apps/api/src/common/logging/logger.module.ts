import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { PinoLogger } from './pino-logger';

@Global()
@Module({
  providers: [
    {
      provide: PinoLogger,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const log = config.get('log', { infer: true });
        return new PinoLogger({
          name: config.get('name', { infer: true }),
          env: config.get('env', { infer: true }),
          level: log.level,
          pretty: log.pretty,
        });
      },
    },
  ],
  exports: [PinoLogger],
})
export class LoggerModule {}

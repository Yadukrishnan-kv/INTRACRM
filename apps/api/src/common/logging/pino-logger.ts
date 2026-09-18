import { LoggerService } from '@nestjs/common';
import pino, { Logger } from 'pino';
import { getRequestContext } from '../http/request-context';

export type PinoLoggerOptions = {
  name: string;
  env: string;
  level: pino.LevelWithSilent;
  pretty: boolean;
};

export class PinoLogger implements LoggerService {
  private readonly logger: Logger;

  constructor(options: PinoLoggerOptions) {
    this.logger = pino({
      name: options.name,
      level: options.level,
      base: {
        service: options.name,
        env: options.env,
      },
      redact: {
        paths: [
          'password',
          'passwordHash',
          'token',
          'accessToken',
          'refreshToken',
          'authorization',
          'req.headers.authorization',
          'otp',
          'code',
        ],
        remove: true,
      },
      timestamp: pino.stdTimeFunctions.isoTime,
      ...(options.pretty
        ? {
            transport: {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'SYS:standard',
                singleLine: true,
              },
            },
          }
        : {}),
    });
  }

  log(message: string, ...optionalParams: unknown[]): void {
    this.child().info(this.merge(optionalParams), message);
  }

  error(message: string, ...optionalParams: unknown[]): void {
    this.child().error(this.merge(optionalParams), message);
  }

  warn(message: string, ...optionalParams: unknown[]): void {
    this.child().warn(this.merge(optionalParams), message);
  }

  debug?(message: string, ...optionalParams: unknown[]): void {
    this.child().debug(this.merge(optionalParams), message);
  }

  verbose?(message: string, ...optionalParams: unknown[]): void {
    this.child().trace(this.merge(optionalParams), message);
  }

  fatal?(message: string, ...optionalParams: unknown[]): void {
    this.child().fatal(this.merge(optionalParams), message);
  }

  private child(): Logger {
    const context = getRequestContext();
    if (!context) {
      return this.logger;
    }
    return this.logger.child({
      requestId: context.requestId,
      tenantId: context.tenantId,
      userId: context.userId,
    });
  }

  private merge(optionalParams: unknown[]): Record<string, unknown> {
    const context = optionalParams.find((item) => typeof item === 'string');
    const err = optionalParams.find((item) => item instanceof Error);
    return {
      ...(context ? { context } : {}),
      ...(err ? { err } : {}),
    };
  }
}

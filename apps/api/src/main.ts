import { RequestMethod } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { json, NextFunction, Request, Response, urlencoded } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AppConfig } from './common/config/configuration';
import { PinoLogger } from './common/logging/pino-logger';
import { setupSwagger } from './common/openapi/swagger.setup';
import { createValidationPipe } from './common/pipes/app-validation.pipe';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    bodyParser: false,
  });

  const config = app.get(ConfigService<AppConfig, true>);
  const logger = app.get(PinoLogger);
  app.useLogger(logger);

  app.use(
    json({
      limit: '8mb',
      verify: (request, _response, buffer) => {
        (request as Request & { rawBody?: Buffer }).rawBody = buffer;
      },
    }),
  );
  app.use(urlencoded({ extended: true, limit: '8mb' }));
  app.use((req: Request, res: Response, next: NextFunction) => {
    const path = req.path ?? '';
    if (path.includes('/public/warranty')) {
      helmet({
        contentSecurityPolicy: {
          useDefaults: true,
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'blob:'],
            mediaSrc: ["'self'", 'blob:'],
            connectSrc: ["'self'"],
            workerSrc: ["'self'", 'blob:'],
          },
        },
        crossOriginEmbedderPolicy: false,
      })(req, res, next);
      return;
    }
    helmet()(req, res, next);
  });
  app.enableCors({
    origin: config.get('corsOrigins', { infer: true }),
    credentials: true,
  });
  app.setGlobalPrefix(config.get('apiPrefix', { infer: true }), {
    exclude: [
      { path: 'api/docs', method: RequestMethod.ALL },
      { path: 'api/docs-json', method: RequestMethod.ALL },
    ],
  });
  app.useGlobalPipes(createValidationPipe());
  app.enableShutdownHooks();

  if (config.get('swaggerEnabled', { infer: true })) {
    setupSwagger(app, 'api/docs');
  }

  const port = config.get('port', { infer: true });
  await app.listen(port);
  logger.log(`${config.get('name', { infer: true })} listening on ${port}`);
}

void bootstrap();

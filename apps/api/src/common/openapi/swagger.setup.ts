import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { HttpHeaders } from '../http/http-headers';

export function setupSwagger(app: INestApplication, path = 'api/docs'): void {
  const config = new DocumentBuilder()
    .setTitle('INTRA LEADS API')
    .setDescription('Enterprise mobile CRM API')
    .setVersion('1.0.0')
    .addBearerAuth()
    .addApiKey(
      {
        type: 'apiKey',
        in: 'header',
        name: HttpHeaders.tenantId,
        description: 'Tenant UUID',
      },
      'tenant',
    )
    .addApiKey(
      {
        type: 'apiKey',
        in: 'header',
        name: HttpHeaders.requestId,
        description: 'Correlation id',
      },
      'requestId',
    )
    .addServer('/api/v1')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(path, app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });
}

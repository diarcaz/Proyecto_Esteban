import { pinLookupKey } from './infrastructure/security/pin-lookup';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { allowedOrigins, validateProductionEnvironment } from './infrastructure/security/deployment-config';
import { validatePinEncryptionKeyOrDie } from './infrastructure/security/pin-encryption.util';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // Phase 3.2 (K): Fail-fast startup validation — MUST run before NestFactory.create
  validateProductionEnvironment();
  pinLookupKey();
  validatePinEncryptionKeyOrDie();
  logger.log('✓ PIN_ENCRYPTION_KEY validated successfully.');

  const app = await NestFactory.create(AppModule);

  // Render's client address is provided by Cloudflare's validated
  // CF-Connecting-IP header. Keep Express proxy trust disabled so caller
  // supplied X-Forwarded-* headers never affect req.ip or other proxy APIs.
  app.getHttpAdapter().getInstance().set('trust proxy', false);

  // Apply Helmet's default CSP to all application responses.
  app.use(helmet());

  app.enableCors({
    origin: allowedOrigins(),
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_SWAGGER === 'true') {
    // Swagger UI embeds initialization code; keep its CSP exception confined to docs.
    app.use('/api/docs', (_request, response, next) => {
      response.removeHeader('Content-Security-Policy');
      next();
    });

    const config = new DocumentBuilder()
      .setTitle('NexuStaff Enterprise — Attendance & Staffing Management API')
      .setDescription('NexuStaff: Multi-location attendance tracking, double-shift management, and agency RBAC')
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
    logger.log('Swagger API Documentation enabled at /api/docs');
  }

  const port = process.env.PORT || 3001;
  await app.listen(port, '0.0.0.0');
  console.log(`Backend Enterprise Attendance Service running on port ${port}`);
}

bootstrap();

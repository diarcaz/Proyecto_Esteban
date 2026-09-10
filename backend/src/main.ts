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
  validatePinEncryptionKeyOrDie();
  logger.log('✓ PIN_ENCRYPTION_KEY validated successfully.');

  const app = await NestFactory.create(AppModule);

  // Security Headers via Helmet
  app.use(
    helmet({
      contentSecurityPolicy: false, // Allowed for Swagger UI rendering
    }),
  );

  app.enableCors({
    origin: allowedOrigins(),
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_SWAGGER === 'true') {
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
  await app.listen(port);
  console.log(`Backend Enterprise Attendance Service running on port ${port}`);
}

bootstrap();

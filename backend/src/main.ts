import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // Security Headers via Helmet
  app.use(
    helmet({
      contentSecurityPolicy: false, // Allowed for Swagger UI rendering
    }),
  );

  // Dynamic CORS Configuration
  const defaultOrigins = [
    'https://nexustaff-frontend.onrender.com',
    'http://localhost:3000',
  ];

  const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
    : process.env.NODE_ENV === 'production'
    ? defaultOrigins
    : true;

  app.enableCors({
    origin: allowedOrigins,
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

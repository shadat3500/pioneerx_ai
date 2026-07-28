import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { AiLoggingInterceptor } from './common/interceptors/ai-logging.interceptor';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import * as compression from 'compression';
import { WinstonModule } from 'nest-winston';
import { winstonConfig } from './common/config/logger.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: WinstonModule.createLogger(winstonConfig),
    // Stripe webhook signatures are computed over the exact bytes sent
    rawBody: true,
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT') || 3000;
  const env = configService.get<string>('NODE_ENV') || 'development';

  // CORS early — before helmet/compression so OPTIONS preflight is not redirected/blocked
  const frontendUrl = (configService.get<string>('FRONTEND_URL') || '').replace(
    /\/$/,
    '',
  );
  const extraOrigins = (configService.get<string>('CORS_ORIGINS') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const allowedOrigins = [
    frontendUrl,
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
    'https://mohaimin8000.sobhoy.com',
    'http://mohaimin8000.sobhoy.com',
    ...extraOrigins,
  ].filter(Boolean);

  app.enableCors({
    // Dev: reflect any Origin (admin Vite, Next, tunnels). Prod: allowlist only.
    origin:
      env === 'production'
        ? (
            origin: string | undefined,
            cb: (err: Error | null, allow?: boolean | string) => void,
          ) => {
            if (!origin || allowedOrigins.includes(origin)) {
              cb(null, true);
            } else {
              cb(null, false);
            }
          }
        : true,
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'Origin',
      'X-Requested-With',
    ],
    optionsSuccessStatus: 204,
  });

  // Security Headers (API — avoid upgrade-insecure-requests; it breaks HTTP clients / preflight)
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: false,
      // Don't force HSTS from API responses (tunnel + local admin mix)
      hsts: false,
    }),
  );

  // Compression
  app.use(compression());

  // Swagger Setup (Conditional)
  if (env !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('PioneerX AI — API')
      .setDescription('The core advisory engine for PioneerX. AI-powered business growth platform.')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
  }

  // Graceful Shutdown
  app.enableShutdownHooks();

  // Global Prefix
  app.setGlobalPrefix('api/v1');

  // Global Validation Pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Global Exception Filter
  app.useGlobalFilters(new HttpExceptionFilter(configService));

  // Global Interceptors
  app.useGlobalInterceptors(new AiLoggingInterceptor());
  app.useGlobalInterceptors(new TransformInterceptor());

  await app.listen(port);
  console.log(`🚀 Application is running on: http://localhost:${port}/api/v1`);
}
bootstrap();

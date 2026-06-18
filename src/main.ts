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
  });

  // Security Headers
  app.use(helmet());

  // Compression
  app.use(compression());

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT') || 3000;
  const env = configService.get<string>('NODE_ENV') || 'development';

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

  // Enable CORS
  app.enableCors();

  await app.listen(port);
  console.log(`🚀 Application is running on: http://localhost:${port}/api/v1`);
}
bootstrap();

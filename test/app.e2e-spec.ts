import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { TransformInterceptor } from './../src/common/interceptors/transform.interceptor';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    const configService = app.get<ConfigService>(ConfigService);
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe());
    app.useGlobalFilters(new HttpExceptionFilter(configService));
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);
  });

  afterAll(async () => {
    await app.close();
  });
});

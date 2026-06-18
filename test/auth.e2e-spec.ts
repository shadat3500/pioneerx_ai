import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

describe('AuthController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const testUser = {
    email: 'test@example.com',
    password: 'Password123!',
    name: 'Test User',
  };

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

    prisma = app.get<PrismaService>(PrismaService);
    
    // Clean up test user if exists
    await prisma.user.deleteMany({
      where: { email: testUser.email },
    });
  });

  describe('POST /auth/register', () => {
    it('should register a new user and return tokens', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(testUser)
        .expect(201);

      expect(response.body.data).toHaveProperty('access_token');
      expect(response.body.data).toHaveProperty('refresh_token');
    });

    it('should fail to register with an existing email', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(testUser)
        .expect(400); // Bad Request (Unique constraint handled by Prisma/ApiError)
    });
  });

  describe('POST /auth/login', () => {
    it('should login and return new tokens', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        })
        .expect(200);

      expect(response.body.data).toHaveProperty('access_token');
      expect(response.body.data).toHaveProperty('refresh_token');
    });

    it('should fail with wrong password', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
          password: 'WrongPassword',
        })
        .expect(403); // Forbidden
    });
  });

  afterAll(async () => {
    // Clean up
    await prisma.user.deleteMany({
      where: { email: testUser.email },
    });
    await app.close();
  });
});

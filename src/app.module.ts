import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { FilesModule } from './modules/files/files.module';
import { MailModule } from './modules/mail/mail.module';
import { AtGuard } from './modules/auth/guards/at.guard';
import { LoggerMiddleware } from './common/middleware/logger.middleware';
import { validationSchema } from './common/config/env.validation';
import { TerminusModule } from '@nestjs/terminus';
import { HttpModule } from '@nestjs/axios';
import { HealthController } from './health.controller';
import { RedisModule } from './common/redis/redis.module';
import { BusinessProfileModule } from './modules/business-profile/business-profile.module';
import { AdminModule } from './modules/admin/admin.module';
import { AiProviderModule } from './modules/ai-provider/ai-provider.module';
import { GenerationModule } from './modules/generation/generation.module';
import { SectionModule } from './modules/section/section.module';
import { DailyTaskModule } from './modules/daily-task/daily-task.module';
import { SubscriptionModule } from './modules/subscription/subscription.module';
import { TokenModule } from './modules/token/token.module';
import { ConversationModule } from './modules/conversation/conversation.module';
import { CreditModule } from './modules/credit/credit.module';
import { NotificationModule } from './modules/notification/notification.module';
import { ImageModule } from './modules/image/image.module';
import { PromoModule } from './modules/promo/promo.module';
import { ReviewModule } from './modules/review/review.module';
import { BullModule } from '@nestjs/bullmq';

import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema,
    }),
    ThrottlerModule.forRoot([{
      ttl: 60,
      limit: 10,
    }]),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          url: config.get<string>('REDIS_URL') || 'redis://localhost:6379',
        },
      }),
    }),
    TerminusModule,
    HttpModule,
    PrismaModule,
    AuthModule,
    FilesModule,
    MailModule,
    RedisModule,
    BusinessProfileModule,
    AdminModule,
    AiProviderModule,
    GenerationModule,
    SectionModule,
    DailyTaskModule,
    SubscriptionModule,
    ConversationModule,
    TokenModule,
    CreditModule,
    NotificationModule,
    ImageModule,
    PromoModule,
    ReviewModule,
  ],



  controllers: [AppController, HealthController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: AtGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes('*');
  }
}

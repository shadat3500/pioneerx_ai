import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisModule as NestRedisModule } from '@nestjs-modules/ioredis';

@Global()
@Module({
  imports: [
    NestRedisModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        type: 'single',
        url: config.get('REDIS_URL') || 'redis://localhost:6379',
      }),
      inject: [ConfigService],
    }),
  ],
  exports: [NestRedisModule],
})
export class RedisModule {}

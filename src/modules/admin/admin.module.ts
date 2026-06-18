import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminRepository } from './admin.repository';
import { AdminJwtStrategy } from './strategies/admin-jwt.strategy';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_AT_SECRET'),
        signOptions: {
          expiresIn: (config.get<string>('JWT_AT_EXPIRES_IN') || '15m') as any,
        },
      }),
    }),
  ],
  controllers: [AdminController],
  providers: [AdminService, AdminRepository, AdminJwtStrategy],
  exports: [AdminService, AdminRepository],
})
export class AdminModule {}

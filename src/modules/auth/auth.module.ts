import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AtStrategy } from './strategies/at.strategy';
import { RtStrategy } from './strategies/rt.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { AppleStrategy } from './strategies/apple.strategy';
import { UsersModule } from '../users/users.module';
import { BusinessProfileModule } from '../business-profile/business-profile.module';
import { CreditModule } from '../credit/credit.module';
import { PromoModule } from '../promo/promo.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';

function oauthProviders() {
  const providers: any[] = [];

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    providers.push(GoogleStrategy);
  }

  if (
    process.env.APPLE_CLIENT_ID &&
    process.env.APPLE_TEAM_ID &&
    process.env.APPLE_KEY_ID &&
    process.env.APPLE_PRIVATE_KEY
  ) {
    providers.push(AppleStrategy);
  }

  return providers;
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_AT_SECRET'),
        signOptions: {
          expiresIn: (config.get<string>('JWT_AT_EXPIRES_IN')) as any,
        },
      }),
    }),
    UsersModule,
    BusinessProfileModule,
    CreditModule,
    PromoModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, AtStrategy, RtStrategy, ...oauthProviders()],
})
export class AuthModule {}

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-apple';

@Injectable()
export class AppleStrategy extends PassportStrategy(Strategy, 'apple') {
  constructor(config: ConfigService) {
    super({
      clientID: config.get('APPLE_CLIENT_ID') || 'placeholder-id',
      teamID: config.get('APPLE_TEAM_ID') || 'placeholder-team',
      keyID: config.get('APPLE_KEY_ID') || 'placeholder-key',
      privateKeyString: config.get('APPLE_PRIVATE_KEY') || 'placeholder-private-key',
      callbackURL: `${config.get('BASE_URL')}/api/v1/auth/apple/callback`,
      passReqToCallback: false,
    });
  }

  async validate(_accessToken: string, _refreshToken: string, idToken: string, profile: any) {
    // Apple returns user data only on the first login
    return {
      email: profile?.email,
      name: profile?.name,
      idToken,
    };
  }
}

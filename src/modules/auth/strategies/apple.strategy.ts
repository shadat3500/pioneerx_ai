import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-apple';

@Injectable()
export class AppleStrategy extends PassportStrategy(Strategy, 'apple') {
  constructor(config: ConfigService) {
    const privateKey = config.get<string>('APPLE_PRIVATE_KEY')?.replace(/\\n/g, '\n');
    const baseUrl = config.get<string>('BASE_URL') || 'http://localhost:3000';

    super({
      clientID: config.get<string>('APPLE_CLIENT_ID')!,
      teamID: config.get<string>('APPLE_TEAM_ID')!,
      keyID: config.get<string>('APPLE_KEY_ID')!,
      privateKeyString: privateKey!,
      callbackURL: `${baseUrl}/api/v1/auth/apple/callback`,
      passReqToCallback: false,
      scope: ['email', 'name'],
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: {
      email?: string;
      name?: { firstName?: string; lastName?: string };
    },
  ) {
    const name = profile.name
      ? [profile.name.firstName, profile.name.lastName].filter(Boolean).join(' ')
      : undefined;

    return {
      email: profile.email,
      name: name || undefined,
    };
  }
}

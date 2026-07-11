import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-google-oauth20';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(config: ConfigService) {
    const clientID = config.get<string>('GOOGLE_CLIENT_ID')!;
    const clientSecret = config.get<string>('GOOGLE_CLIENT_SECRET')!;
    const baseUrl = config.get<string>('BASE_URL') || 'http://localhost:3000';
    const callbackURL =
      config.get<string>('GOOGLE_CALLBACK_URL') ||
      `${baseUrl}/api/v1/auth/google/callback`;

    super({
      clientID,
      clientSecret,
      callbackURL,
      scope: ['email', 'profile'],
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: {
      name?: { givenName?: string; familyName?: string };
      emails?: { value: string }[];
    },
  ) {
    const email = profile.emails?.[0]?.value;
    const name = [profile.name?.givenName, profile.name?.familyName]
      .filter(Boolean)
      .join(' ');

    return { email, name: name || undefined };
  }
}

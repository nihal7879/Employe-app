import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy, VerifyCallback } from 'passport-google-oauth20';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(config: ConfigService) {
    // GOOGLE_CALLBACK_URL may hold a comma-separated list (e.g. localhost +
    // prod). Passport needs a SINGLE redirect_uri or Google rejects the request
    // ("Access blocked: this app's request is invalid"). Pick by environment.
    const isProd = config.get<string>('NODE_ENV') === 'production';
    const urls = config
      .get<string>('GOOGLE_CALLBACK_URL', 'http://localhost:4000/auth/google/callback')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const callbackURL =
      (isProd ? urls.find((u) => u.startsWith('https')) : urls.find((u) => u.includes('localhost'))) ||
      urls[0];

    super({
      clientID: config.get<string>('GOOGLE_CLIENT_ID') || 'unconfigured.apps.googleusercontent.com',
      clientSecret: config.get<string>('GOOGLE_CLIENT_SECRET') || 'unconfigured',
      callbackURL,
      scope: ['email', 'profile'],
    });
    if (!config.get<string>('GOOGLE_CLIENT_ID')) {
      new Logger(GoogleStrategy.name).warn(
        'GOOGLE_CLIENT_ID not set — /auth/google routes will not work until configured.',
      );
    }
  }

  validate(_at: string, _rt: string, profile: Profile, done: VerifyCallback) {
    const email = profile.emails?.[0]?.value;
    const name = profile.displayName;
    const picture = profile.photos?.[0]?.value;
    done(null, { email, name, picture });
  }
}

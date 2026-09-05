import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// Stripe v22 CJS: default import compiles to `.default` and breaks at runtime on Nest.
import Stripe = require('stripe');

/**
 * Thin wrapper around the Stripe SDK.
 * The API must still boot when STRIPE_SECRET_KEY is absent, so the client is
 * optional and callers get a 503 instead of a crash.
 */
@Injectable()
export class StripeClient {
  private readonly logger = new Logger(StripeClient.name);
  private readonly client: Stripe | null;

  constructor(private readonly config: ConfigService) {
    const secretKey = (this.config.get<string>('STRIPE_SECRET_KEY') || '').trim();

    if (secretKey) {
      this.client = new Stripe(secretKey);
      this.logger.log('Stripe billing enabled.');
    } else {
      this.client = null;
      this.logger.warn(
        'STRIPE_SECRET_KEY not set — /billing endpoints will return 503 and Stripe webhooks are ignored.',
      );
    }
  }

  get isEnabled(): boolean {
    return this.client !== null;
  }

  get stripe(): Stripe {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'Stripe billing is not configured on this server.',
      );
    }
    return this.client;
  }

  get webhookSecret(): string {
    return (this.config.get<string>('STRIPE_WEBHOOK_SECRET') || '').trim();
  }

  get currency(): string {
    return (this.config.get<string>('STRIPE_CURRENCY') || 'usd').toLowerCase();
  }

  get successUrl(): string {
    return (
      this.config.get<string>('STRIPE_SUCCESS_URL') ||
      `${this.frontendUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`
    );
  }

  get cancelUrl(): string {
    return (
      this.config.get<string>('STRIPE_CANCEL_URL') ||
      `${this.frontendUrl}/billing/cancelled`
    );
  }

  get portalReturnUrl(): string {
    return (
      this.config.get<string>('STRIPE_PORTAL_RETURN_URL') ||
      `${this.frontendUrl}/idea-validation`
    );
  }

  private get frontendUrl(): string {
    return (
      this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000'
    ).replace(/\/$/, '');
  }
}

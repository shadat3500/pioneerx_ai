import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { SubscriptionRepository } from './subscription.repository';
import { SubscriptionTier } from '@prisma/client';
import { CreditService } from '../credit/credit.service';

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    private readonly repository: SubscriptionRepository,
    private readonly creditService: CreditService,
  ) { }

  private mapProductToTier(productId: string): SubscriptionTier {
    if (!productId) return SubscriptionTier.FREE;
    const lower = productId.toLowerCase();
    if (lower.includes('elite')) return SubscriptionTier.ELITE;
    if (lower.includes('pro_plus') || lower.includes('proplus')) return SubscriptionTier.PRO_PLUS;
    if (lower.includes('pro')) return SubscriptionTier.PRO;
    return SubscriptionTier.FREE;
  }

  async handleWebhook(headers: any, body: any) {
    // 1. Verify shared secret/bearer token from RevenueCat dashboard
    const authHeader = headers['authorization'];
    const expectedSecret = process.env.REVENUECAT_SECRET_KEY;

    if (expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
      this.logger.error('RevenueCat Webhook signature mismatch.');
      throw new UnauthorizedException('Invalid token');
    }

    const event = body.event;
    if (!event) {
      this.logger.warn('Skipping empty RevenueCat event.');
      return { success: false, message: 'No event details' };
    }

    const userId = event.app_user_id;
    const productId = event.product_id;
    const eventType = event.type;
    const entitlementId = event.entitlement_id;
    const expirationAtMs = event.expiration_at_ms;

    this.logger.log(`RevenueCat event: ${eventType} for User: ${userId}, Product: ${productId}`);

    // Verify user exists in database
    const user = await this.repository.findUserById(userId);
    if (!user) {
      this.logger.error(`User ${userId} from RevenueCat event not found in database.`);
      return { success: false, message: 'User not found' };
    }

    let targetTier = this.mapProductToTier(productId);
    let status = 'active';

    if (eventType === 'EXPIRATION' || eventType === 'CANCELLATION') {
      targetTier = SubscriptionTier.FREE;
      status = 'expired';
    }

    const renewsAt = expirationAtMs ? new Date(expirationAtMs) : null;

    await this.repository.upsertSubscription(userId, {
      tier: targetTier,
      revenuecatEntitlementId: entitlementId || null,
      status,
      renewsAt,
    });

    // v1.5 §11 — reset monthly credits when the billing cycle renews
    if (
      (eventType === 'RENEWAL' || eventType === 'INITIAL_PURCHASE') &&
      targetTier !== SubscriptionTier.FREE
    ) {
      try {
        await this.creditService.resetOnBillingCycle(userId);
        this.logger.log(`Credit balance reset on billing cycle for User ${userId}`);
      } catch (err) {
        this.logger.error(`Credit reset failed for User ${userId}: ${(err as Error).message}`);
      }
    }

    this.logger.log(`Successfully updated User ${userId} subscription tier to ${targetTier}`);
    return { success: true };
  }

  async getSubscriptionForUser(userId: string) {
    const user = await this.repository.findUserById(userId);
    let sub = await this.repository.findByUserId(userId);

    if (!sub) {
      sub = await this.repository.createDefaultSubscription(userId);
    }

    return {
      ...sub,
      trialEndsAt: user?.trialEndsAt ?? null,
    };
  }
}

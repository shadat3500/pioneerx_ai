import { Injectable, Logger } from '@nestjs/common';
import { SubscriptionTier } from '@prisma/client';
import { SubscriptionRepository } from './subscription.repository';

@Injectable()
export class TrialExpiryService {
  private readonly logger = new Logger(TrialExpiryService.name);

  constructor(private readonly repository: SubscriptionRepository) {}

  async expireTrials() {
    const now = new Date();
    const expiredUsers = await this.repository.findUsersWithExpiredTrial(now);

    let normalizedCount = 0;

    for (const user of expiredUsers) {
      if (!user.subscription) {
        await this.repository.createDefaultSubscription(user.id);
        normalizedCount += 1;
        this.logger.log(`Created FREE subscription for expired trial user ${user.id}`);
        continue;
      }

      if (user.subscription.tier !== SubscriptionTier.FREE) {
        await this.repository.upsertSubscription(user.id, {
          tier: SubscriptionTier.FREE,
          status: 'active',
        });
        normalizedCount += 1;
        this.logger.log(`Normalized user ${user.id} subscription to FREE after trial expiry`);
      }
    }

    return {
      scanned: expiredUsers.length,
      normalized: normalizedCount,
    };
  }
}

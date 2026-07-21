import { Injectable, NotFoundException } from '@nestjs/common';
import { SectionRepository } from './section.repository';
import { SubscriptionTier } from '@prisma/client';

@Injectable()
export class SectionService {
  constructor(private readonly repository: SectionRepository) { }

  async findAllForUser(userId: string) {
    // 1. Get user subscription tier
    let sub = await this.repository.getUserSubscription(userId);
    if (!sub) {
      sub = await this.repository.createDefaultSubscription(userId);
    }

    const userTier = sub.tier;

    // 2. Fetch all active sections
    const allSections = await this.repository.findAllActive();

    // 3. v1.5 §13 — return ALL sections with an isLocked flag instead of filtering
    const tiers = [SubscriptionTier.FREE, SubscriptionTier.PRO, SubscriptionTier.PRO_PLUS, SubscriptionTier.ELITE];
    const userTierIndex = tiers.indexOf(userTier);

    return allSections.map((sec) => ({
      ...sec,
      isLocked: tiers.indexOf(sec.requiredTier) > userTierIndex,
    }));

    /* [COMMENT OUT] v1.4 behaviour — filtered out inaccessible sections entirely
    return allSections.filter((sec) => {
      const requiredIndex = tiers.indexOf(sec.requiredTier);
      return userTierIndex >= requiredIndex;
    });
    */
  }

  async findOne(key: string) {
    const section = await this.repository.findByKey(key);

    if (!section || !section.isActive) {
      throw new NotFoundException(`Section not found or inactive: ${key}`);
    }

    return section;
  }
}

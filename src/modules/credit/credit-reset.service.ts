import { Injectable, Logger } from '@nestjs/common';
import { SubscriptionTier } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreditService } from './credit.service';

@Injectable()
export class CreditResetService {
  private readonly logger = new Logger(CreditResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly creditService: CreditService,
  ) {}

  /**
   * Runs at midnight daily.
   * 5a — Free users past their trial reset to CreditConfig.dailyCredits.
   * 5b — Trial users reset to CreditConfig.trialCredits.
   */
  async resetDailyCredits() {
    const config = await this.creditService.getCreditConfig(SubscriptionTier.FREE);
    if (!config) {
      this.logger.warn('No FREE CreditConfig found — skipping daily credit reset.');
      return { free: 0, trial: 0 };
    }

    const now = new Date();
    let freeCount = 0;
    let trialCount = 0;

    // 5b — active trial users
    if (config.trialCredits != null) {
      const trialUsers = await this.prisma.user.findMany({
        where: { trialEndsAt: { gt: now } },
        select: { id: true },
      });

      for (const user of trialUsers) {
        try {
          await this.creditService.resetBalance(user.id, config.trialCredits, 'daily trial reset');
          trialCount++;
        } catch (err) {
          this.logger.error(`Trial credit reset failed for ${user.id}: ${(err as Error).message}`);
        }
      }
    }

    // 5a — free users whose trial has ended (or never had one)
    if (config.dailyCredits != null) {
      const freeUsers = await this.prisma.user.findMany({
        where: {
          OR: [{ trialEndsAt: null }, { trialEndsAt: { lt: now } }],
          AND: [
            {
              OR: [
                { subscription: null },
                { subscription: { tier: SubscriptionTier.FREE } },
              ],
            },
          ],
        },
        select: { id: true },
      });

      for (const user of freeUsers) {
        try {
          await this.creditService.resetBalance(user.id, config.dailyCredits, 'daily reset');
          freeCount++;
        } catch (err) {
          this.logger.error(`Free credit reset failed for ${user.id}: ${(err as Error).message}`);
        }
      }
    }

    this.logger.log(`Daily credit reset complete — free: ${freeCount}, trial: ${trialCount}`);
    return { free: freeCount, trial: trialCount };
  }
}

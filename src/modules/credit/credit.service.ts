import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { SubscriptionTier } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CREDIT_LOW_THRESHOLD } from './credit.constants';

export interface CreditStatus {
  balance: number;
  limit: number | null;
  percentage: number;
  resetAt: Date;
}

@Injectable()
export class CreditService {
  private readonly logger = new Logger(CreditService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─────────────────────────────────────────────
  // Lifecycle helpers
  // ─────────────────────────────────────────────

  /** Create the CreditBalance row for a newly registered user (trial credits on day 1). */
  async initializeForUser(userId: string) {
    const config = await this.getCreditConfig(SubscriptionTier.FREE);
    const startingBalance = config?.trialCredits ?? config?.dailyCredits ?? 0;

    return this.prisma.creditBalance.upsert({
      where: { userId },
      update: {},
      create: {
        userId,
        balance: startingBalance,
        lastResetAt: new Date(),
      },
    });
  }

  private async ensureBalance(userId: string) {
    const existing = await this.prisma.creditBalance.findUnique({ where: { userId } });
    if (existing) return existing;
    return this.initializeForUser(userId);
  }

  async getCreditConfig(tier: SubscriptionTier) {
    return this.prisma.creditConfig.findUnique({ where: { tier } });
  }

  private isPaidActive(tier: SubscriptionTier, status?: string | null) {
    const paid =
      tier === SubscriptionTier.PRO ||
      tier === SubscriptionTier.PRO_PLUS ||
      tier === SubscriptionTier.ELITE;
    return paid && (!status || status === 'active' || status === 'trialing');
  }

  /**
   * Paid checkout must end the free trial and grant monthly credits.
   * Also repairs Elite/Pro users who paid but still have 0 trial credits
   * (which locked the chat input on the frontend).
   */
  async activatePaidPlan(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { subscription: true },
    });
    if (!user?.subscription) return;
    if (!this.isPaidActive(user.subscription.tier, user.subscription.status)) {
      return;
    }

    if (user.trialEndsAt) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { trialEndsAt: null },
      });
    }

    const config = await this.getCreditConfig(user.subscription.tier);
    if (!config?.monthlyCredits) return;

    const lastReset = await this.prisma.creditTransaction.findFirst({
      where: { userId, type: 'reset' },
      orderBy: { createdAt: 'desc' },
    });
    const desc = lastReset?.description ?? '';
    const needsGrant =
      !lastReset ||
      desc.includes('trial') ||
      desc === 'daily reset';

    if (needsGrant) {
      await this.resetBalance(
        userId,
        config.monthlyCredits,
        'billing reset',
      );
      this.logger.log(
        `Granted ${config.monthlyCredits} ${user.subscription.tier} credits to ${userId}`,
      );
    }
  }

  // ─────────────────────────────────────────────
  // 3a. checkBalance
  // ─────────────────────────────────────────────

  async checkBalance(
    userId: string,
    estimatedCost: number,
  ): Promise<{ allowed: boolean; balance: number }> {
    const record = await this.ensureBalance(userId);
    return {
      allowed: record.balance >= estimatedCost,
      balance: record.balance,
    };
  }

  // ─────────────────────────────────────────────
  // 3b. reserve — deduct immediately, keep transaction id for refunds
  // ─────────────────────────────────────────────

  async reserve(
    userId: string,
    amount: number,
    description: string,
  ): Promise<{ reservationId: string }> {
    await this.ensureBalance(userId);

    const tx = await this.prisma.$transaction(async (db) => {
      await db.creditBalance.update({
        where: { userId },
        data: {
          balance: { decrement: amount },
          lifetimeUsed: { increment: amount },
        },
      });

      return db.creditTransaction.create({
        data: {
          userId,
          amount: -amount,
          type: 'deduct',
          description,
        },
      });
    });

    return { reservationId: tx.id };
  }

  // ─────────────────────────────────────────────
  // 3c. confirm — balance already deducted at reserve time
  // ─────────────────────────────────────────────

  async confirm(reservationId: string): Promise<void> {
    const tx = await this.prisma.creditTransaction.findUnique({
      where: { id: reservationId },
    });
    if (!tx) {
      this.logger.warn(`confirm(): reservation ${reservationId} not found`);
    }
  }

  /** Attach a generationId to a confirmed reservation (for audit). */
  async linkGeneration(reservationId: string, generationId: string): Promise<void> {
    try {
      await this.prisma.creditTransaction.update({
        where: { id: reservationId },
        data: { generationId },
      });
    } catch {
      /* audit-only; never fail the request */
    }
  }

  // ─────────────────────────────────────────────
  // 3d. refund
  // ─────────────────────────────────────────────

  async refund(reservationId: string): Promise<void> {
    const tx = await this.prisma.creditTransaction.findUnique({
      where: { id: reservationId },
    });
    if (!tx || tx.type !== 'deduct') {
      this.logger.warn(`refund(): reservation ${reservationId} not found or not a deduct`);
      return;
    }

    const alreadyRefunded = await this.prisma.creditTransaction.findFirst({
      where: { userId: tx.userId, type: 'refund', description: `refund:${reservationId}` },
    });
    if (alreadyRefunded) return;

    const amount = Math.abs(tx.amount);

    await this.prisma.$transaction(async (db) => {
      await db.creditBalance.update({
        where: { userId: tx.userId },
        data: {
          balance: { increment: amount },
          lifetimeUsed: { decrement: amount },
        },
      });

      await db.creditTransaction.create({
        data: {
          userId: tx.userId,
          amount,
          type: 'refund',
          description: `refund:${reservationId}`,
        },
      });
    });
  }

  // ─────────────────────────────────────────────
  // 3e. getStatus — used by frontend credit meter
  // ─────────────────────────────────────────────

  async getStatus(userId: string): Promise<CreditStatus> {
    await this.activatePaidPlan(userId);

    const record = await this.ensureBalance(userId);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { subscription: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const tier = user.subscription?.tier ?? SubscriptionTier.FREE;
    const paidActive = this.isPaidActive(tier, user.subscription?.status);
    const isTrialActive =
      !paidActive && !!(user.trialEndsAt && user.trialEndsAt > new Date());

    const config = await this.getCreditConfig(
      isTrialActive ? SubscriptionTier.FREE : tier,
    );

    let limit: number | null = null;
    let resetAt: Date;

    if (paidActive || (tier !== SubscriptionTier.FREE && !isTrialActive)) {
      limit = config?.monthlyCredits ?? null;
      resetAt =
        user.subscription?.renewsAt ??
        new Date(new Date(record.lastResetAt).setMonth(record.lastResetAt.getMonth() + 1));
    } else if (isTrialActive) {
      limit = config?.trialCredits ?? config?.dailyCredits ?? null;
      resetAt = this.getNextMidnight();
    } else {
      limit = config?.dailyCredits ?? null;
      resetAt = this.getNextMidnight();
    }

    const used = limit !== null ? Math.max(limit - record.balance, 0) : 0;
    const percentage =
      limit && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

    return {
      balance: record.balance,
      limit,
      percentage,
      resetAt,
    };
  }

  // ─────────────────────────────────────────────
  // 3f. resetOnBillingCycle — RevenueCat RENEWAL
  // ─────────────────────────────────────────────

  async resetOnBillingCycle(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { subscription: true },
    });
    if (!user) return;

    const tier = user.subscription?.tier ?? SubscriptionTier.FREE;
    const config = await this.getCreditConfig(tier);
    if (!config?.monthlyCredits) return;

    await this.resetBalance(userId, config.monthlyCredits, 'billing reset');
  }

  async resetBalance(userId: string, newBalance: number, description: string) {
    await this.ensureBalance(userId);

    await this.prisma.$transaction(async (db) => {
      await db.creditBalance.update({
        where: { userId },
        data: {
          balance: newBalance,
          lastResetAt: new Date(),
        },
      });

      await db.creditTransaction.create({
        data: {
          userId,
          amount: newBalance,
          type: 'reset',
          description,
        },
      });
    });
  }

  // ─────────────────────────────────────────────
  // 3g. checkAndNotifyLow
  // ─────────────────────────────────────────────

  async checkAndNotifyLow(userId: string): Promise<void> {
    try {
      const status = await this.getStatus(userId);
      if (status.limit === null) return;
      if (status.balance > status.limit * CREDIT_LOW_THRESHOLD) return;

      const existingUnread = await this.prisma.notification.findFirst({
        where: { userId, type: 'credit_low', isRead: false },
      });
      if (existingUnread) return;

      await this.prisma.notification.create({
        data: {
          userId,
          type: 'credit_low',
          message: 'You have less than 10% of your credits remaining.',
        },
      });
    } catch (err) {
      this.logger.error(`checkAndNotifyLow failed for ${userId}: ${(err as Error).message}`);
    }
  }

  private getNextMidnight(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 1);
    return d;
  }
}

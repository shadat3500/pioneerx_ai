import { Injectable, Logger } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { SubscriptionTier } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface DailyQuotaResult {
  allowed: boolean;
  used: number;
  limit: number | null;
  resetAt: Date;
  percentage: number;
}

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  resolveQuotaTier(tier: SubscriptionTier, trialEndsAt: Date | null | undefined): SubscriptionTier {
    if (trialEndsAt && trialEndsAt > new Date()) {
      return SubscriptionTier.FREE;
    }
    return tier;
  }

  getStartOfDay(date: Date = new Date()): Date {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  getNextMidnight(from: Date = new Date()): Date {
    const resetAt = this.getStartOfDay(from);
    resetAt.setDate(resetAt.getDate() + 1);
    return resetAt;
  }

  async getQuotaLimit(tier: SubscriptionTier): Promise<number | null> {
    const cacheKey = `quota-config:${tier}`;

    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        return parsed.dailyTokenLimit ?? null;
      }
    } catch (err) {
      this.logger.error(`Redis read error: ${(err as Error).message}`);
    }

    const config = await this.prisma.quotaConfig.findUnique({ where: { tier } });
    const limit = config?.dailyTokenLimit ?? null;

    try {
      await this.redis.set(cacheKey, JSON.stringify({ dailyTokenLimit: limit }), 'EX', 300);
    } catch (err) {
      this.logger.error(`Redis write error: ${(err as Error).message}`);
    }

    return limit;
  }

  async invalidateQuotaCache(tier: SubscriptionTier) {
    await this.redis.del(`quota-config:${tier}`);
  }

  async getTodayUsage(userId: string): Promise<number> {
    const startOfDay = this.getStartOfDay();
    const aggregate = await this.prisma.tokenUsage.aggregate({
      where: {
        userId,
        date: { gte: startOfDay },
      },
      _sum: {
        inputTokens: true,
        outputTokens: true,
      },
    });

    return (aggregate._sum.inputTokens ?? 0) + (aggregate._sum.outputTokens ?? 0);
  }

  async checkDailyQuota(
    userId: string,
    tier: SubscriptionTier,
    trialEndsAt?: Date | null,
  ): Promise<DailyQuotaResult> {
    const effectiveTier = this.resolveQuotaTier(tier, trialEndsAt);
    const limit = await this.getQuotaLimit(effectiveTier);
    const used = await this.getTodayUsage(userId);
    const resetAt = this.getNextMidnight();
    const allowed = limit === null || used < limit;
    const percentage =
      limit && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

    return { allowed, used, limit, resetAt, percentage };
  }

  async getTokenStatus(
    userId: string,
    tier: SubscriptionTier,
    trialEndsAt?: Date | null,
  ) {
    const { used, limit, resetAt, percentage } = await this.checkDailyQuota(
      userId,
      tier,
      trialEndsAt,
    );

    return { used, limit, percentage, resetAt };
  }

  async getTokenStatusForUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { subscription: true },
    });

    const tier = user?.subscription?.tier ?? SubscriptionTier.FREE;
    return this.getTokenStatus(userId, tier, user?.trialEndsAt);
  }

  async logUsage(data: {
    userId: string;
    generationId?: string;
    provider: string;
    modelId: string;
    inputTokens: number;
    outputTokens: number;
  }): Promise<void> {
    const pricing = await this.prisma.modelPricing.findUnique({
      where: {
        provider_modelId: {
          provider: data.provider,
          modelId: data.modelId,
        },
      },
    });

    let estimatedCostUsd = 0;
    if (pricing) {
      estimatedCostUsd =
        (data.inputTokens / 1_000_000) * pricing.inputPricePerMToken +
        (data.outputTokens / 1_000_000) * pricing.outputPricePerMToken;
    }

    await this.prisma.tokenUsage.create({
      data: {
        userId: data.userId,
        generationId: data.generationId,
        provider: data.provider,
        modelId: data.modelId,
        inputTokens: data.inputTokens,
        outputTokens: data.outputTokens,
        estimatedCostUsd,
      },
    });
  }
}

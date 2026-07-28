import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BaseRepository } from '../../common/repositories/base.repository';
import { Subscription, SubscriptionTier } from '@prisma/client';

@Injectable()
export class SubscriptionRepository extends BaseRepository<Subscription> {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma, 'subscription');
  }

  async findByUserId(userId: string) {
    return this.prisma.subscription.findUnique({
      where: { userId },
    });
  }

  async findUserById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  async upsertSubscription(userId: string, data: any) {
    return this.prisma.subscription.upsert({
      where: { userId },
      update: data,
      create: {
        userId,
        ...data,
      },
    });
  }

  async createDefaultSubscription(userId: string) {
    return this.prisma.subscription.create({
      data: {
        userId,
        tier: SubscriptionTier.FREE,
        status: 'active',
      },
    });
  }

  /** Returns true when this provider event was already processed. */
  async recordWebhookEvent(provider: string, eventId: string, type: string) {
    try {
      await this.prisma.webhookEvent.create({
        data: { provider, eventId, type },
      });
      return false;
    } catch {
      return true;
    }
  }

  async findUsersWithExpiredTrial(now: Date) {
    return this.prisma.user.findMany({
      where: {
        trialEndsAt: { lt: now },
      },
      include: { subscription: true },
    });
  }
}

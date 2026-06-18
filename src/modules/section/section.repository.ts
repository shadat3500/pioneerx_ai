import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BaseRepository } from '../../common/repositories/base.repository';
import { Section, SubscriptionTier } from '@prisma/client';

@Injectable()
export class SectionRepository extends BaseRepository<Section> {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma, 'section');
  }

  async findAllActive() {
    return this.prisma.section.findMany({
      where: { isActive: true },
      include: {
        toolCatalog: { where: { isActive: true } },
        suggestedLinks: true,
      },
    });
  }

  async findByKey(key: string) {
    return this.prisma.section.findUnique({
      where: { key },
      include: {
        toolCatalog: { where: { isActive: true } },
        suggestedLinks: true,
      },
    });
  }

  async getUserSubscription(userId: string) {
    return this.prisma.subscription.findUnique({
      where: { userId },
    });
  }

  async createDefaultSubscription(userId: string) {
    return this.prisma.subscription.create({
      data: { userId, tier: SubscriptionTier.FREE },
    });
  }
}

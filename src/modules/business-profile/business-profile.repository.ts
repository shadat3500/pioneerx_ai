import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BaseRepository } from '../../common/repositories/base.repository';
import { BusinessProfile, BusinessPhase, SubscriptionTier } from '@prisma/client';

@Injectable()
export class BusinessProfileRepository extends BaseRepository<BusinessProfile> {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma, 'businessProfile');
  }

  async findUserWithActiveProfile(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, activeProfileId: true },
    });
  }

  async findByIdForUser(id: string, userId: string) {
    return this.prisma.businessProfile.findFirst({
      where: { id, userId },
    });
  }

  async findAllByUserId(userId: string) {
    return this.prisma.businessProfile.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async countByUserId(userId: string) {
    return this.prisma.businessProfile.count({
      where: { userId },
    });
  }

  async getUserSubscriptionTier(userId: string): Promise<SubscriptionTier> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
      select: { tier: true },
    });
    return subscription?.tier ?? SubscriptionTier.FREE;
  }

  async findActiveProfile(userId: string) {
    const user = await this.findUserWithActiveProfile(userId);
    if (!user?.activeProfileId) {
      return null;
    }
    return this.prisma.businessProfile.findFirst({
      where: { id: user.activeProfileId, userId },
    });
  }

  async createProfile(
    userId: string,
    data: {
      businessName?: string;
      industry?: string;
      currentPhase?: BusinessPhase;
      country?: string;
    },
  ) {
    return this.prisma.businessProfile.create({
      data: {
        userId,
        ...data,
      },
    });
  }

  async updateProfile(
    id: string,
    userId: string,
    data: {
      businessName?: string;
      industry?: string;
      currentPhase?: BusinessPhase;
      country?: string;
    },
  ) {
    return this.prisma.businessProfile.update({
      where: { id, userId },
      data,
    });
  }

  async deleteProfile(id: string, userId: string) {
    return this.prisma.businessProfile.delete({
      where: { id, userId },
    });
  }

  async setActiveProfile(userId: string, profileId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { activeProfileId: profileId },
    });
  }

  async createDefaultProfileForUser(userId: string): Promise<BusinessProfile> {
    const existing = await this.countByUserId(userId);
    if (existing > 0) {
      const user = await this.findUserWithActiveProfile(userId);
      if (user?.activeProfileId) {
        const active = await this.findByIdForUser(user.activeProfileId, userId);
        if (active) {
          return active;
        }
      }
      const first = await this.prisma.businessProfile.findFirst({
        where: { userId },
        orderBy: { createdAt: 'asc' },
      });
      if (first) {
        await this.setActiveProfile(userId, first.id);
        return first;
      }
    }

    const profile = await this.createProfile(userId, { currentPhase: BusinessPhase.IDEA });
    await this.setActiveProfile(userId, profile.id);
    return profile;
  }

  async resolveActiveProfile(userId: string): Promise<BusinessProfile> {
    let profile = await this.findActiveProfile(userId);
    if (profile) {
      return profile;
    }
    return this.createDefaultProfileForUser(userId);
  }
}

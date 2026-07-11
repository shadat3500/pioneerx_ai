import { CanActivate, ExecutionContext, Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { SubscriptionTier } from '@prisma/client';

@Injectable()
export class SectionAccessGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) { }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) return false;

    const sectionKey = request.params.key || request.params.sectionKey;
    if (!sectionKey) return true;

    const section = await this.prisma.section.findUnique({
      where: { key: sectionKey },
    });

    if (!section) {
      throw new NotFoundException(`Section not found: ${sectionKey}`);
    }

    if (!section.isActive) {
      throw new ForbiddenException('Section is currently inactive');
    }

    // Fetch user's subscription
    let userSub = await this.prisma.subscription.findUnique({
      where: { userId: user.sub },
    });

    // If no subscription record, create a default FREE subscription
    if (!userSub) {
      userSub = await this.prisma.subscription.create({
        data: {
          userId: user.sub,
          tier: SubscriptionTier.FREE,
        },
      });
    }

    const userTier = userSub.tier;
    const requiredTier = section.requiredTier;

    const tiers = [SubscriptionTier.FREE, SubscriptionTier.PRO, SubscriptionTier.PRO_PLUS, SubscriptionTier.ELITE];

    if (tiers.indexOf(userTier) < tiers.indexOf(requiredTier)) {
      throw new ForbiddenException(
        `Access denied. This section requires ${requiredTier} subscription tier. Your current tier is ${userTier}.`,
      );
    }

    request.section = section;
    return true;
  }
}

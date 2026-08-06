import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SubscriptionTier } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StripeClient } from './stripe.client';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeClient: StripeClient,
  ) {}

  /** Public pricing table — driven by the admin-managed price map. */
  listPlans() {
    return this.prisma.stripePrice.findMany({
      where: { isActive: true },
      orderBy: [{ amount: 'asc' }, { tier: 'asc' }],
      select: {
        priceId: true,
        tier: true,
        interval: true,
        label: true,
        amount: true,
        compareAtAmount: true,
        currency: true,
      },
    });
  }

  async createCheckoutSession(userId: string, dto: CreateCheckoutSessionDto) {
    const stripe = this.stripeClient.stripe;
    const price = await this.resolvePrice(dto);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { subscription: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const customerId = await this.ensureCustomer(
      user.id,
      user.email,
      user.name,
      user.subscription?.stripeCustomerId ?? null,
    );

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: price.priceId, quantity: 1 }],
      // Both are read by the webhook to map the payment back to our user
      client_reference_id: user.id,
      metadata: { userId: user.id, tier: price.tier },
      subscription_data: { metadata: { userId: user.id, tier: price.tier } },
      allow_promotion_codes: true,
      success_url: this.stripeClient.successUrl,
      cancel_url: this.stripeClient.cancelUrl,
    });

    this.logger.log(
      `Checkout session ${session.id} created for user ${user.id} (${price.tier} / ${price.interval})`,
    );

    return {
      url: session.url,
      sessionId: session.id,
      tier: price.tier,
      interval: price.interval,
    };
  }

  async createPortalSession(userId: string) {
    const stripe = this.stripeClient.stripe;

    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
    });
    if (!subscription?.stripeCustomerId) {
      throw new BadRequestException(
        'No Stripe customer for this account yet. Subscribe first.',
      );
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: this.stripeClient.portalReturnUrl,
    });

    return { url: session.url };
  }

  /**
   * Lets the success page confirm immediately instead of polling until the
   * webhook lands.
   */
  async getCheckoutSession(userId: string, sessionId: string) {
    const stripe = this.stripeClient.stripe;

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const owner = session.metadata?.userId || session.client_reference_id;
    if (owner !== userId) {
      throw new NotFoundException('Checkout session not found');
    }

    return {
      sessionId: session.id,
      status: session.status,
      paymentStatus: session.payment_status,
      tier: session.metadata?.tier ?? null,
    };
  }

  listPayments(userId: string) {
    return this.prisma.paymentRecord.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  private async resolvePrice(dto: CreateCheckoutSessionDto) {
    if (dto.priceId) {
      const byId = await this.prisma.stripePrice.findFirst({
        where: { priceId: dto.priceId, isActive: true },
      });
      if (!byId) {
        throw new NotFoundException(
          `Price "${dto.priceId}" is not available for checkout`,
        );
      }
      return byId;
    }

    if (dto.tier) {
      if (dto.tier === SubscriptionTier.FREE) {
        throw new BadRequestException('The FREE tier does not require checkout');
      }
      const byTier = await this.prisma.stripePrice.findFirst({
        where: {
          tier: dto.tier,
          interval: dto.interval ?? 'month',
          isActive: true,
        },
      });
      if (!byTier) {
        throw new NotFoundException(
          `No active ${dto.interval ?? 'month'}ly price configured for ${dto.tier}`,
        );
      }
      return byTier;
    }

    throw new BadRequestException('Provide either priceId or tier');
  }

  private async ensureCustomer(
    userId: string,
    email: string,
    name: string | null,
    existingCustomerId: string | null,
  ): Promise<string> {
    if (existingCustomerId) return existingCustomerId;

    const customer = await this.stripeClient.stripe.customers.create({
      email,
      name: name ?? undefined,
      metadata: { userId },
    });

    await this.prisma.subscription.upsert({
      where: { userId },
      update: { stripeCustomerId: customer.id },
      create: {
        userId,
        tier: SubscriptionTier.FREE,
        status: 'active',
        stripeCustomerId: customer.id,
      },
    });

    return customer.id;
  }
}

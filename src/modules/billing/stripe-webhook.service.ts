import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { SubscriptionTier } from '@prisma/client';
import Stripe from 'stripe';
import { PrismaService } from '../../prisma/prisma.service';
import { CreditService } from '../credit/credit.service';
import { StripeClient } from './stripe.client';

const PROVIDER = 'stripe';

interface SubscriptionStateUpdate {
  tier?: SubscriptionTier;
  status?: string;
  renewsAt?: Date | null;
  cancelAtPeriodEnd?: boolean;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripePriceId?: string | null;
}

@Injectable()
export class StripeWebhookService {
  private readonly logger = new Logger(StripeWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeClient: StripeClient,
    private readonly creditService: CreditService,
  ) {}

  async handle(rawBody: Buffer | undefined, signature: string | undefined) {
    if (!this.stripeClient.isEnabled) {
      this.logger.warn('Stripe webhook received but STRIPE_SECRET_KEY is unset.');
      return { received: true, skipped: 'stripe_not_configured' };
    }

    const secret = this.stripeClient.webhookSecret;
    if (!secret) {
      this.logger.error('Stripe webhook received but STRIPE_WEBHOOK_SECRET is unset.');
      return { received: true, skipped: 'missing_webhook_secret' };
    }

    if (!rawBody) {
      throw new BadRequestException(
        'Raw request body unavailable — Nest must be created with { rawBody: true }',
      );
    }

    let event: Stripe.Event;
    try {
      event = this.stripeClient.stripe.webhooks.constructEvent(
        rawBody,
        signature ?? '',
        secret,
      );
    } catch (err) {
      this.logger.error(
        `Stripe signature verification failed: ${(err as Error).message}`,
      );
      throw new BadRequestException('Invalid Stripe signature');
    }

    // Stripe retries delivery; the unique (provider, eventId) row is the guard.
    try {
      await this.prisma.webhookEvent.create({
        data: { provider: PROVIDER, eventId: event.id, type: event.type },
      });
    } catch {
      this.logger.log(`Duplicate Stripe event ${event.id} (${event.type}) ignored.`);
      return { received: true, duplicate: true };
    }

    this.logger.log(`Stripe event ${event.type} (${event.id})`);

    try {
      switch (event.type) {
        case 'checkout.session.completed':
          await this.onCheckoutCompleted(event.data.object);
          break;
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
          await this.onSubscriptionChanged(event.data.object);
          break;
        case 'customer.subscription.deleted':
          await this.onSubscriptionDeleted(event.data.object);
          break;
        case 'invoice.payment_succeeded':
          await this.onInvoicePaid(event.data.object);
          break;
        case 'invoice.payment_failed':
          await this.onInvoiceFailed(event.data.object);
          break;
        default:
          this.logger.debug(`Unhandled Stripe event type ${event.type}`);
      }
    } catch (err) {
      // Never 500 back to Stripe for a handler bug — that only triggers retries
      // of an event we already recorded as processed.
      this.logger.error(
        `Stripe handler failed for ${event.type} (${event.id}): ${(err as Error).message}`,
      );
    }

    return { received: true, type: event.type };
  }

  // ─────────────────────────────────────────────
  // Handlers
  // ─────────────────────────────────────────────

  private async onCheckoutCompleted(session: Stripe.Checkout.Session) {
    const userId = session.metadata?.userId || session.client_reference_id;
    if (!userId) {
      this.logger.error(
        `checkout.session.completed ${session.id} has no userId metadata — skipped.`,
      );
      return;
    }

    const customerId = this.idOf(session.customer);
    const subscriptionId = this.idOf(session.subscription);

    if (!subscriptionId) {
      await this.applyState(userId, { stripeCustomerId: customerId });
      return;
    }

    const subscription =
      await this.stripeClient.stripe.subscriptions.retrieve(subscriptionId);
    await this.syncFromStripeSubscription(userId, subscription);
  }

  private async onSubscriptionChanged(subscription: Stripe.Subscription) {
    const userId = await this.resolveUserId(subscription);
    if (!userId) return;
    await this.syncFromStripeSubscription(userId, subscription);
  }

  private async onSubscriptionDeleted(subscription: Stripe.Subscription) {
    const userId = await this.resolveUserId(subscription);
    if (!userId) return;

    await this.applyState(userId, {
      tier: SubscriptionTier.FREE,
      status: 'expired',
      cancelAtPeriodEnd: false,
      stripeSubscriptionId: subscription.id,
    });
  }

  private async onInvoicePaid(invoice: Stripe.Invoice) {
    const userId = await this.resolveUserIdFromInvoice(invoice);
    if (!userId) return;

    await this.recordPayment(userId, invoice, 'paid');

    const reason = invoice.billing_reason ?? '';
    if (
      reason === 'subscription_create' ||
      reason === 'subscription_cycle' ||
      reason === 'subscription_update'
    ) {
      try {
        await this.creditService.resetOnBillingCycle(userId);
        this.logger.log(`Credits reset after Stripe payment for user ${userId}`);
      } catch (err) {
        this.logger.error(
          `Credit reset failed for user ${userId}: ${(err as Error).message}`,
        );
      }
    }
  }

  private async onInvoiceFailed(invoice: Stripe.Invoice) {
    const userId = await this.resolveUserIdFromInvoice(invoice);
    if (!userId) return;

    await this.recordPayment(userId, invoice, 'failed');
    await this.applyState(userId, { status: 'past_due' });

    await this.prisma.notification.create({
      data: {
        userId,
        type: 'platform_update',
        message:
          'Your subscription payment failed. Please update your payment method to keep your plan active.',
      },
    });
  }

  // ─────────────────────────────────────────────
  // Shared logic
  // ─────────────────────────────────────────────

  private async syncFromStripeSubscription(
    userId: string,
    subscription: Stripe.Subscription,
  ) {
    const priceId = subscription.items?.data?.[0]?.price?.id ?? null;
    const tier = priceId ? await this.tierForPrice(priceId) : null;
    const periodEnd = this.periodEndOf(subscription);

    await this.applyState(userId, {
      ...(tier ? { tier } : {}),
      status: this.mapStatus(subscription.status),
      renewsAt: periodEnd,
      cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
      stripeCustomerId: this.idOf(subscription.customer),
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
    });
  }

  /**
   * Writes Stripe state onto the shared Subscription row.
   * A provider may upgrade a row it does not own, but must never downgrade
   * another provider's active paid plan (e.g. a Play Store subscriber).
   */
  private async applyState(userId: string, update: SubscriptionStateUpdate) {
    const existing = await this.prisma.subscription.findUnique({
      where: { userId },
    });

    const isDowngrade = update.tier === SubscriptionTier.FREE;
    const otherProviderOwnsPaidPlan =
      !!existing?.provider &&
      existing.provider !== PROVIDER &&
      existing.status === 'active' &&
      existing.tier !== SubscriptionTier.FREE;

    if (isDowngrade && otherProviderOwnsPaidPlan) {
      this.logger.warn(
        `Skipped Stripe downgrade for user ${userId}: ${existing?.provider} owns an active ${existing?.tier} plan.`,
      );
      return;
    }

    const data = {
      ...update,
      provider: PROVIDER,
    };

    await this.prisma.subscription.upsert({
      where: { userId },
      update: data,
      create: {
        userId,
        tier: update.tier ?? SubscriptionTier.FREE,
        status: update.status ?? 'active',
        ...data,
      },
    });
  }

  private async tierForPrice(priceId: string): Promise<SubscriptionTier | null> {
    const mapping = await this.prisma.stripePrice.findUnique({
      where: { priceId },
    });
    if (!mapping) {
      this.logger.error(
        `Stripe price ${priceId} has no tier mapping — tier left unchanged. Add it in Admin → Stripe prices.`,
      );
      return null;
    }
    return mapping.tier;
  }

  private async recordPayment(
    userId: string,
    invoice: Stripe.Invoice,
    status: 'paid' | 'failed',
  ) {
    const amount =
      status === 'paid'
        ? invoice.amount_paid ?? invoice.amount_due ?? 0
        : invoice.amount_due ?? 0;

    try {
      await this.prisma.paymentRecord.create({
        data: {
          userId,
          provider: PROVIDER,
          invoiceId: invoice.id ?? null,
          amount,
          currency: invoice.currency ?? this.stripeClient.currency,
          status,
          description: invoice.billing_reason ?? null,
        },
      });
    } catch {
      // Same invoice can arrive twice (e.g. retried payment) — unique invoiceId
      this.logger.log(`Payment record for invoice ${invoice.id} already exists.`);
    }
  }

  private async resolveUserId(
    subscription: Stripe.Subscription,
  ): Promise<string | null> {
    const fromMetadata = subscription.metadata?.userId;
    if (fromMetadata) return fromMetadata;

    const bySubscription = await this.prisma.subscription.findFirst({
      where: { stripeSubscriptionId: subscription.id },
      select: { userId: true },
    });
    if (bySubscription) return bySubscription.userId;

    const customerId = this.idOf(subscription.customer);
    if (customerId) {
      const byCustomer = await this.prisma.subscription.findFirst({
        where: { stripeCustomerId: customerId },
        select: { userId: true },
      });
      if (byCustomer) return byCustomer.userId;
    }

    this.logger.error(
      `Could not map Stripe subscription ${subscription.id} to a PioneerX user.`,
    );
    return null;
  }

  private async resolveUserIdFromInvoice(
    invoice: Stripe.Invoice,
  ): Promise<string | null> {
    const fromMetadata = invoice.metadata?.userId;
    if (fromMetadata) return fromMetadata;

    const subscriptionId = this.subscriptionIdOf(invoice);
    if (subscriptionId) {
      const bySubscription = await this.prisma.subscription.findFirst({
        where: { stripeSubscriptionId: subscriptionId },
        select: { userId: true },
      });
      if (bySubscription) return bySubscription.userId;
    }

    const customerId = this.idOf(invoice.customer);
    if (customerId) {
      const byCustomer = await this.prisma.subscription.findFirst({
        where: { stripeCustomerId: customerId },
        select: { userId: true },
      });
      if (byCustomer) return byCustomer.userId;
    }

    this.logger.error(
      `Could not map Stripe invoice ${invoice.id} to a PioneerX user.`,
    );
    return null;
  }

  private mapStatus(status: Stripe.Subscription.Status): string {
    switch (status) {
      case 'active':
      case 'trialing':
        return 'active';
      case 'past_due':
      case 'unpaid':
        return 'past_due';
      case 'canceled':
      case 'incomplete_expired':
        return 'expired';
      default:
        return status;
    }
  }

  private idOf(value: unknown): string | null {
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object' && 'id' in value) {
      return String((value as { id: string }).id);
    }
    return null;
  }

  /**
   * `current_period_end` sits on the subscription in older API versions and on
   * the subscription item in newer ones — read whichever is present.
   */
  private periodEndOf(subscription: Stripe.Subscription): Date | null {
    const loose = subscription as unknown as {
      current_period_end?: number;
      items?: { data?: { current_period_end?: number }[] };
    };
    const seconds =
      loose.current_period_end ?? loose.items?.data?.[0]?.current_period_end;
    return seconds ? new Date(seconds * 1000) : null;
  }

  /** Invoices reference their subscription directly or via `parent` (newer API). */
  private subscriptionIdOf(invoice: Stripe.Invoice): string | null {
    const loose = invoice as unknown as {
      subscription?: string | { id: string };
      parent?: { subscription_details?: { subscription?: string | { id: string } } };
    };
    return (
      this.idOf(loose.subscription) ??
      this.idOf(loose.parent?.subscription_details?.subscription)
    );
  }
}

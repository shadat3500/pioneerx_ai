import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { StripeClient } from './stripe.client';
import { StripeWebhookController } from './stripe-webhook.controller';
import { StripeWebhookService } from './stripe-webhook.service';
import { CreditModule } from '../credit/credit.module';

@Module({
  imports: [CreditModule],
  controllers: [BillingController, StripeWebhookController],
  providers: [StripeClient, BillingService, StripeWebhookService],
  exports: [BillingService, StripeClient],
})
export class BillingModule {}

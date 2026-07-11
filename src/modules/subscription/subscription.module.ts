import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionService } from './subscription.service';
import { SubscriptionRepository } from './subscription.repository';
import { TrialExpiryService } from './trial-expiry.service';
import { TrialExpiryProcessor } from './trial-expiry.processor';
import { TrialExpiryCronRegister } from './trial-expiry.cron-register';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'trial-expiry',
    }),
  ],
  controllers: [SubscriptionController],
  providers: [
    SubscriptionService,
    SubscriptionRepository,
    TrialExpiryService,
    TrialExpiryProcessor,
    TrialExpiryCronRegister,
  ],
  exports: [SubscriptionService, SubscriptionRepository],
})
export class SubscriptionModule {}

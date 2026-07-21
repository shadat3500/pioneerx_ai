import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CreditService } from './credit.service';
import { CreditController } from './credit.controller';
import { CreditResetService } from './credit-reset.service';
import { CreditResetProcessor } from './credit-reset.processor';
import { CreditResetCronRegister } from './credit-reset.cron-register';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'credit-reset',
    }),
  ],
  controllers: [CreditController],
  providers: [
    CreditService,
    CreditResetService,
    CreditResetProcessor,
    CreditResetCronRegister,
  ],
  exports: [CreditService],
})
export class CreditModule {}

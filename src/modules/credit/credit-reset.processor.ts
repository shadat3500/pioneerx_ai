import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { CreditResetService } from './credit-reset.service';

@Processor('credit-reset')
export class CreditResetProcessor extends WorkerHost {
  private readonly logger = new Logger(CreditResetProcessor.name);

  constructor(private readonly creditResetService: CreditResetService) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    this.logger.log(`Processing BullMQ job: ${job.name}`);

    if (job.name === 'reset-daily-credits') {
      return this.creditResetService.resetDailyCredits();
    }

    return null;
  }
}

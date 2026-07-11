import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { TrialExpiryService } from './trial-expiry.service';

@Processor('trial-expiry')
export class TrialExpiryProcessor extends WorkerHost {
  private readonly logger = new Logger(TrialExpiryProcessor.name);

  constructor(private readonly trialExpiryService: TrialExpiryService) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    this.logger.log(`Processing BullMQ job: ${job.name}`);

    if (job.name === 'expire-trials') {
      return this.trialExpiryService.expireTrials();
    }

    return null;
  }
}

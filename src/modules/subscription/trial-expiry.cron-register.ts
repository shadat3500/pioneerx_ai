import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class TrialExpiryCronRegister implements OnModuleInit {
  private readonly logger = new Logger(TrialExpiryCronRegister.name);

  constructor(@InjectQueue('trial-expiry') private readonly queue: Queue) {}

  async onModuleInit() {
    this.logger.log('Registering daily trial expiry cron job...');

    try {
      const repeatableJobs = await this.queue.getRepeatableJobs();
      for (const job of repeatableJobs) {
        if (job.name === 'expire-trials') {
          await this.queue.removeRepeatableByKey(job.key);
        }
      }

      await this.queue.add(
        'expire-trials',
        {},
        {
          repeat: {
            pattern: '0 0 * * *',
          },
        },
      );

      this.logger.log('Trial expiry cron job successfully registered.');
    } catch (err) {
      this.logger.error(`Failed to register trial expiry cron job: ${(err as Error).message}`);
    }
  }
}

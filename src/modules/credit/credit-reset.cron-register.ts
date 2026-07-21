import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class CreditResetCronRegister implements OnModuleInit {
  private readonly logger = new Logger(CreditResetCronRegister.name);

  constructor(@InjectQueue('credit-reset') private readonly queue: Queue) {}

  async onModuleInit() {
    this.logger.log('Registering daily credit reset cron job...');

    try {
      const repeatableJobs = await this.queue.getRepeatableJobs();
      for (const job of repeatableJobs) {
        if (job.name === 'reset-daily-credits') {
          await this.queue.removeRepeatableByKey(job.key);
        }
      }

      await this.queue.add(
        'reset-daily-credits',
        {},
        {
          repeat: {
            pattern: '0 0 * * *',
          },
        },
      );

      this.logger.log('Credit reset cron job successfully registered.');
    } catch (err) {
      this.logger.error(`Failed to register credit reset cron job: ${(err as Error).message}`);
    }
  }
}

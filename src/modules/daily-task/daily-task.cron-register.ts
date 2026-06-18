import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class DailyTaskCronRegister implements OnModuleInit {
  private readonly logger = new Logger(DailyTaskCronRegister.name);

  constructor(@InjectQueue('daily-tasks') private readonly queue: Queue) {}

  async onModuleInit() {
    this.logger.log('Registering midnight daily tasks cron job...');

    try {
      // Clean up previous registration to prevent duplicates
      const repeatableJobs = await this.queue.getRepeatableJobs();
      for (const job of repeatableJobs) {
        if (job.name === 'generate-all-users') {
          await this.queue.removeRepeatableByKey(job.key);
        }
      }

      // Add repeatable job to run at midnight every day
      await this.queue.add(
        'generate-all-users',
        {},
        {
          repeat: {
            pattern: '0 0 * * *',
          },
        },
      );
      this.logger.log('✅ Daily tasks cron job successfully registered.');
    } catch (err) {
      this.logger.error(`Failed to register daily tasks cron job: ${(err as any).message}`);
    }
  }
}

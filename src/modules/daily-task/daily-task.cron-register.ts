import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class DailyTaskCronRegister implements OnModuleInit {
  private readonly logger = new Logger(DailyTaskCronRegister.name);

  constructor(@InjectQueue('daily-tasks') private readonly queue: Queue) {}

  async onModuleInit() {
    this.logger.log('Removing legacy midnight daily-task cron (tasks sync on section prompt submit).');

    try {
      const repeatableJobs = await this.queue.getRepeatableJobs();
      for (const job of repeatableJobs) {
        if (job.name === 'generate-all-users') {
          await this.queue.removeRepeatableByKey(job.key);
        }
      }
    } catch (err) {
      this.logger.error(`Failed to clean up daily tasks cron job: ${(err as Error).message}`);
    }
  }
}

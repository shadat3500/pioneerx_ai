import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';

@Processor('daily-tasks')
export class DailyTaskProcessor extends WorkerHost {
  private readonly logger = new Logger(DailyTaskProcessor.name);

  async process(job: Job): Promise<void> {
    this.logger.warn(
      `Ignored legacy daily-tasks job "${job.name}" — daily tasks are synced on section generate.`,
    );
  }
}

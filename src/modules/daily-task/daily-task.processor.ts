import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { DailyTaskService } from './daily-task.service';
import { Logger } from '@nestjs/common';

@Processor('daily-tasks')
export class DailyTaskProcessor extends WorkerHost {
  private readonly logger = new Logger(DailyTaskProcessor.name);

  constructor(private readonly dailyTaskService: DailyTaskService) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.log(`Processing BullMQ job: ${job.name}`);
    
    if (job.name === 'generate-all-users') {
      const userIds = await this.dailyTaskService.getActiveUserIds();
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      this.logger.log(`Pre-generating tasks for ${userIds.length} active users for date ${today.toISOString()}`);
      
      for (const userId of userIds) {
        try {
          await this.dailyTaskService.generateTasksForDay(userId, today);
        } catch (err) {
          this.logger.error(`Failed to pre-generate tasks for user ${userId}: ${(err as any).message}`);
        }
      }
    }
  }
}

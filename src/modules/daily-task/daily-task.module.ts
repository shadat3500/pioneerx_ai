import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DailyTaskController } from './daily-task.controller';
import { DailyTaskService } from './daily-task.service';
import { DailyTaskRepository } from './daily-task.repository';
import { DailyTaskProcessor } from './daily-task.processor';
import { DailyTaskCronRegister } from './daily-task.cron-register';
import { AiProviderModule } from '../ai-provider/ai-provider.module';
import { BusinessProfileModule } from '../business-profile/business-profile.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'daily-tasks',
    }),
    AiProviderModule,
    BusinessProfileModule,
  ],
  controllers: [DailyTaskController],
  providers: [DailyTaskService, DailyTaskRepository, DailyTaskProcessor, DailyTaskCronRegister],
  exports: [DailyTaskService, DailyTaskRepository],
})
export class DailyTaskModule {}

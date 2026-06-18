import { Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DailyTaskService } from './daily-task.service';
import { GetCurrentUser } from '../auth/decorators/get-current-user.decorator';

@ApiTags('DailyTasks')
@ApiBearerAuth()
@Controller('daily-tasks')
export class DailyTaskController {
  constructor(private readonly dailyTaskService: DailyTaskService) {}

  @Get('today')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get daily advisory task list for today' })
  getTodayTasks(@GetCurrentUser('sub') userId: string) {
    return this.dailyTaskService.getTodayTasks(userId);
  }

  @Patch(':id/toggle/:taskId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Toggle completion check status of a specific daily task' })
  toggleTask(
    @GetCurrentUser('sub') userId: string,
    @Param('id') recordId: string,
    @Param('taskId') taskId: string,
  ) {
    return this.dailyTaskService.toggleTask(userId, recordId, taskId);
  }

  @Post('regenerate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Regenerate today\'s daily task list' })
  regenerate(@GetCurrentUser('sub') userId: string) {
    return this.dailyTaskService.regenerateTodayTasks(userId);
  }
}

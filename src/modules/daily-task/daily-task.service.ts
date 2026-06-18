import { Injectable, NotFoundException } from '@nestjs/common';
import { DailyTaskRepository } from './daily-task.repository';
import { AiProviderService } from '../ai-provider/ai-provider.service';
import { ModelRole } from '@prisma/client';

@Injectable()
export class DailyTaskService {
  constructor(
    private readonly repository: DailyTaskRepository,
    private readonly aiProvider: AiProviderService,
  ) { }

  /**
   * Helper to format a date to midnight-only (start of day)
   */
  private getStartOfDay(date: Date = new Date()): Date {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  async getTodayTasks(userId: string) {
    const today = this.getStartOfDay();

    // 1. Check if tasks are already generated for today
    const taskRecord = await this.repository.findByUserAndDate(userId, today);

    if (taskRecord) {
      return taskRecord;
    }

    // 2. Generate fallback tasks (on-the-fly) if missing
    return this.generateTasksForDay(userId, today);
  }

  async generateTasksForDay(userId: string, targetDate: Date) {
    const startOfTarget = this.getStartOfDay(targetDate);

    // Fetch user profile
    let profile = await this.repository.findBusinessProfile(userId);
    if (!profile) {
      profile = await this.repository.createBusinessProfile(userId);
    }

    // Fetch yesterday's tasks for context
    const yesterday = new Date(startOfTarget);
    yesterday.setDate(yesterday.getDate() - 1);

    const yesterdayRecord = await this.repository.findByUserAndDate(userId, yesterday);

    const yesterdayTasks = yesterdayRecord ? yesterdayRecord.tasks : [];

    // Construct prompt
    const prompt = `
You are the Expert AI Daily Task Generator for the PioneerX business advisory app.
Generate exactly 3 to 5 highly actionable tasks for today based on the user's profile and yesterday's progress.

User Profile:
- Business Name: ${profile.businessName || 'N/A'}
- Industry: ${profile.industry || 'N/A'}
- Current Phase: ${profile.currentPhase}

Yesterday's Tasks & Completion Status:
${JSON.stringify(yesterdayTasks, null, 2)}

Instructions:
Return ONLY a valid JSON object matching the schema below. Do not wrap in markdown block tags.
Schema:
{
  "tasks": [
    { "id": "unique-task-id", "text": "Task content", "priority": "HIGH", "isDone": false }
  ]
}
Note: Priority values must be: "HIGH" or "MEDIUM" or "LOW". Use prefix "dt-" for task IDs (e.g. "dt-1", "dt-2").
`;

    let tasksList: any[] = [];
    try {
      const response = await this.aiProvider.callModel(ModelRole.DAILY_TASK_GENERATOR, prompt);
      const parsed = typeof response === 'string' ? JSON.parse(response) : response;
      tasksList = parsed.tasks || [];
    } catch (err) {
      // Fallback default tasks if model call fails
      tasksList = [
        { id: 'dt-1', text: 'Set clear execution milestones for today.', priority: 'HIGH', isDone: false },
        { id: 'dt-2', text: 'Review industry competitors trends.', priority: 'MEDIUM', isDone: false },
        { id: 'dt-3', text: 'Document target customer pain points.', priority: 'LOW', isDone: false },
      ];
    }

    // Persist today's daily task list
    return this.repository.upsertDailyTask(userId, startOfTarget, tasksList, 0);
  }

  async toggleTask(userId: string, recordId: string, taskId: string) {
    const record = await this.repository.findById(recordId);

    if (!record || record.userId !== userId) {
      throw new NotFoundException('Daily task list not found');
    }

    const tasks = record.tasks as any[];
    const updatedTasks = tasks.map((t) => {
      if (t.id === taskId) {
        return { ...t, isDone: !t.isDone };
      }
      return t;
    });

    return this.repository.updateTasks(recordId, updatedTasks);
  }

  async regenerateTodayTasks(userId: string) {
    const today = this.getStartOfDay();

    // Check if record exists
    const record = await this.repository.findByUserAndDate(userId, today);

    const nextRegenCount = record ? record.regenerateCount + 1 : 1;

    // Call task generator
    const updated = await this.generateTasksForDay(userId, today);

    return this.repository.updateRegenerateCount(updated.id, nextRegenCount);
  }

  /**
   * Helper to fetch active users for pre-generation
   */
  async getActiveUserIds(): Promise<string[]> {
    return this.repository.getActiveUserIds();
  }
}

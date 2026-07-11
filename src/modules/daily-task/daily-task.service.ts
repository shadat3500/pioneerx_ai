import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DailyTaskRepository } from './daily-task.repository';
import { AiProviderService } from '../ai-provider/ai-provider.service';
import { BusinessProfileService } from '../business-profile/business-profile.service';
import { BusinessProfile, ModelRole, Prisma } from '@prisma/client';
import {
  AI_TASKS_ON_REPLENISH,
  AI_TASKS_ON_SYNC,
  DailyTaskItem,
  DailyTaskListResponse,
  DailyTaskPriority,
  SOFT_CAP_DAILY_TASKS,
} from './daily-task.types';

@Injectable()
export class DailyTaskService {
  private readonly logger = new Logger(DailyTaskService.name);

  constructor(
    private readonly repository: DailyTaskRepository,
    private readonly aiProvider: AiProviderService,
    private readonly businessProfileService: BusinessProfileService,
  ) {}

  private getStartOfDay(date: Date = new Date()): Date {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  async getTodayTasks(userId: string): Promise<DailyTaskListResponse> {
    const activeProfile = await this.businessProfileService.resolveActiveProfile(userId);
    const businessProfileId = activeProfile.id;

    const hasGenerations = await this.repository.hasAnyGeneration(businessProfileId);
    if (!hasGenerations) {
      return {
        tasks: [],
        empty: true,
        message: 'Generate advice from a section to get your daily tasks.',
      };
    }

    const today = this.getStartOfDay();
    const record = await this.repository.findByProfileAndDate(businessProfileId, today);

    if (record) {
      return this.toResponse(record);
    }

    const tasks = await this.buildTasksFromPendingActionSteps(businessProfileId, today);
    if (tasks.length === 0) {
      return {
        tasks: [],
        empty: true,
        message: 'Generate advice from a section to get your daily tasks.',
      };
    }

    const saved = await this.repository.upsertDailyTask(
      userId,
      businessProfileId,
      today,
      this.toJsonTasks(tasks),
      0,
    );
    return this.toResponse(saved);
  }

  /**
   * Called after each section prompt/generate.
   * - Different sections accumulate (sec1 → 1–4, sec2 → +5–8).
   * - Same section again replaces only that section's tasks; others stay.
   */
  async syncFromGeneration(
    userId: string,
    businessProfileId: string,
    generationId: string,
    sectionKey: string,
  ) {
    const today = this.getStartOfDay();
    const existing = await this.repository.findByProfileAndDate(businessProfileId, today);
    const currentTasks = existing ? this.parseTasks(existing.tasks) : [];

    const removedCount = currentTasks.filter((t) => t.sectionKey === sectionKey).length;
    const keptTasks = currentTasks.filter((t) => t.sectionKey !== sectionKey);

    const newGenSteps = await this.repository.findActionStepsForGeneration(generationId);
    const newGenTasks = newGenSteps.map((step) =>
      this.actionStepToDailyTask(step, step.generation.section.key),
    );

    const linkedIds = new Set(
      keptTasks.map((t) => t.actionStepId).filter((id): id is string => !!id),
    );
    const newToAdd = newGenTasks.filter(
      (t) => t.actionStepId && !linkedIds.has(t.actionStepId),
    );

    let merged = this.orderTasksUnfinishedFirst([...keptTasks, ...newToAdd]);

    const profile = await this.businessProfileService.resolveActiveProfile(userId);
    const aiTasks = await this.generateAiTasks(businessProfileId, profile, today, {
      maxTasks: AI_TASKS_ON_SYNC,
      trigger: 'generation',
      sectionKey,
      generationId,
      existingTasks: merged,
      includeYesterday: false,
    });
    merged = this.orderTasksUnfinishedFirst([
      ...merged,
      ...aiTasks.filter((t) => !merged.some((m) => m.id === t.id)),
    ]);

    merged = this.applySoftCap(merged);

    await this.repository.upsertDailyTask(
      userId,
      businessProfileId,
      today,
      this.toJsonTasks(merged),
      existing?.regenerateCount ?? 0,
    );

    this.logger.log(
      `Synced daily tasks for user ${userId} profile ${businessProfileId} from generation ${generationId} (${sectionKey}); ` +
        `replaced ${removedCount} task(s) for section, added ${newToAdd.length}, total ${merged.length}`,
    );
  }

  private orderTasksUnfinishedFirst(tasks: DailyTaskItem[]): DailyTaskItem[] {
    return [
      ...tasks.filter((t) => !t.isDone),
      ...tasks.filter((t) => t.isDone),
    ];
  }

  private applySoftCap(tasks: DailyTaskItem[]): DailyTaskItem[] {
    if (tasks.length <= SOFT_CAP_DAILY_TASKS) {
      return tasks;
    }
    return this.orderTasksUnfinishedFirst(tasks).slice(0, SOFT_CAP_DAILY_TASKS);
  }

  async toggleTask(userId: string, recordId: string, taskId: string) {
    const record = await this.repository.findById(recordId);

    if (!record || record.userId !== userId) {
      throw new NotFoundException('Daily task list not found');
    }

    const tasks = this.parseTasks(record.tasks);
    const target = tasks.find((t) => t.id === taskId);
    if (!target) {
      throw new NotFoundException('Daily task not found');
    }

    const wasDone = target.isDone;
    const updatedTasks = tasks.map((t) =>
      t.id === taskId ? { ...t, isDone: !t.isDone } : t,
    );

    await this.repository.updateTasks(recordId, this.toJsonTasks(updatedTasks));

    if (!wasDone) {
      return this.replenishOnUserInteraction(userId, recordId);
    }

    return this.repository.findById(recordId);
  }

  async regenerateTodayTasks(userId: string) {
    const activeProfile = await this.businessProfileService.resolveActiveProfile(userId);
    const businessProfileId = activeProfile.id;

    const today = this.getStartOfDay();
    const record = await this.repository.findByProfileAndDate(businessProfileId, today);
    const nextRegenCount = record ? record.regenerateCount + 1 : 1;

    const hasGenerations = await this.repository.hasAnyGeneration(businessProfileId);
    if (!hasGenerations) {
      return {
        tasks: [],
        empty: true,
        message: 'Generate advice from a section to get your daily tasks.',
        regenerateCount: nextRegenCount,
      };
    }

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayRecord = await this.repository.findByProfileAndDate(businessProfileId, yesterday);
    const yesterdayTasks = yesterdayRecord ? this.parseTasks(yesterdayRecord.tasks) : [];

    const pendingSteps = await this.repository.findAllPendingActionSteps(businessProfileId);
    const fromSteps = pendingSteps.map((step) =>
      this.actionStepToDailyTask(step, step.generation.section.key),
    );

    const unfinishedFromSteps = fromSteps.filter((t) => !t.isDone);
    let merged = this.orderTasksUnfinishedFirst([...unfinishedFromSteps]);

    const aiTasks = await this.generateAiTasks(businessProfileId, activeProfile, today, {
      maxTasks: AI_TASKS_ON_SYNC + 1,
      trigger: 'regenerate',
      existingTasks: merged,
      includeYesterday: true,
      yesterdayTasks,
    });
    merged = this.applySoftCap(
      this.orderTasksUnfinishedFirst([...merged, ...aiTasks]),
    );

    const saved = await this.repository.upsertDailyTask(
      userId,
      businessProfileId,
      today,
      this.toJsonTasks(merged),
      nextRegenCount,
    );

    return this.toResponse(saved);
  }

  private async replenishOnUserInteraction(userId: string, recordId: string) {
    const today = this.getStartOfDay();
    const record = await this.repository.findById(recordId);
    if (!record) {
      throw new NotFoundException('Daily task list not found');
    }

    const businessProfileId = record.businessProfileId;
    const profile = await this.businessProfileService.resolveActiveProfile(userId);

    const tasks = this.parseTasks(record.tasks);
    const unfinished = tasks.filter((t) => !t.isDone);
    const linkedActionStepIds = new Set(
      tasks.map((t) => t.actionStepId).filter((id): id is string => !!id),
    );

    const pendingSteps = await this.repository.findAllPendingActionSteps(businessProfileId);
    const newFromSteps = pendingSteps
      .filter((step) => !linkedActionStepIds.has(step.id))
      .map((step) => this.actionStepToDailyTask(step, step.generation.section.key));

    let merged = this.orderTasksUnfinishedFirst([...unfinished, ...newFromSteps]);

    if (unfinished.length === 0) {
      const aiTasks = await this.generateAiTasks(businessProfileId, profile, today, {
        maxTasks: AI_TASKS_ON_REPLENISH,
        trigger: 'completion',
        existingTasks: merged,
        includeYesterday: true,
      });
      merged = this.orderTasksUnfinishedFirst([...merged, ...aiTasks]);
    }

    await this.repository.updateTasks(
      recordId,
      this.toJsonTasks(this.applySoftCap(merged)),
    );

    return this.repository.findById(recordId);
  }

  private async buildTasksFromPendingActionSteps(businessProfileId: string, today: Date) {
    const pendingSteps = await this.repository.findPendingActionStepsFromToday(
      businessProfileId,
      today,
    );
    return pendingSteps.map((step) =>
      this.actionStepToDailyTask(step, step.generation.section.key),
    );
  }

  private actionStepToDailyTask(
    step: {
      id: string;
      text: string;
      description: string | null;
      order: number;
      generationId: string;
    },
    sectionKey: string,
  ): DailyTaskItem {
    const priority: DailyTaskPriority =
      step.order === 1 ? 'HIGH' : step.order === 2 ? 'MEDIUM' : 'LOW';

    return {
      id: `dt-${step.id}`,
      text: step.text,
      description: step.description || undefined,
      priority,
      isDone: false,
      source: 'action_step',
      actionStepId: step.id,
      generationId: step.generationId,
      sectionKey,
    };
  }

  private async generateAiTasks(
    businessProfileId: string,
    profile: BusinessProfile,
    today: Date,
    options: {
      maxTasks: number;
      trigger: 'generation' | 'regenerate' | 'completion';
      sectionKey?: string;
      generationId?: string;
      existingTasks: DailyTaskItem[];
      includeYesterday: boolean;
      yesterdayTasks?: DailyTaskItem[];
    },
  ): Promise<DailyTaskItem[]> {
    if (options.maxTasks <= 0) {
      return [];
    }

    const todaysGenerations = await this.repository.findTodaysGenerations(businessProfileId, today);
    const generationContext = todaysGenerations.map((g) => ({
      section: g.section.key,
      userPrompt: g.userPrompt,
      actionSteps: g.actionSteps.map((s) => ({
        text: s.text,
        description: s.description,
        isDone: s.isDone,
      })),
    }));

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayRecord = options.includeYesterday
      ? await this.repository.findByProfileAndDate(businessProfileId, yesterday)
      : null;
    const yesterdayTasks =
      options.yesterdayTasks ??
      (yesterdayRecord ? this.parseTasks(yesterdayRecord.tasks) : []);

    const prompt = `
You are the PioneerX Daily Task Generator.
Generate ${options.maxTasks} new highly actionable daily tasks for the user.
Trigger: ${options.trigger}

User Profile:
- Business Name: ${profile.businessName || 'N/A'}
- Industry: ${profile.industry || 'N/A'}
- Current Phase: ${profile.currentPhase}

Today's Section Advice (all prompts submitted today):
${JSON.stringify(generationContext, null, 2)}

Yesterday's Daily Tasks & Completion:
${JSON.stringify(yesterdayTasks, null, 2)}

Already on today's list (do not duplicate):
${JSON.stringify(
  options.existingTasks.map((t) => ({
    text: t.text,
    isDone: t.isDone,
    sectionKey: t.sectionKey,
  })),
  null,
  2,
)}

Instructions:
- Prioritize follow-ups from unfinished section action steps.
- Return ${options.maxTasks} NEW tasks only.
- Return ONLY valid JSON, no markdown.
Schema:
{
  "tasks": [
    { "text": "Task title", "description": "Short detail", "priority": "HIGH" }
  ]
}
Priority must be HIGH, MEDIUM, or LOW.
`;

    try {
      const response = await this.aiProvider.callModel(ModelRole.DAILY_TASK_GENERATOR, prompt);
      const rawTasks = (response.json.tasks as unknown[]) || [];

      return rawTasks.slice(0, options.maxTasks).map((item, index) => {
        const entry = item as Record<string, unknown>;
        const priority = this.normalizePriority(entry.priority);
        return {
          id: `dt-ai-${Date.now()}-${index}`,
          text: String(entry.text || 'Follow up on your section advice'),
          description:
            typeof entry.description === 'string' ? entry.description : undefined,
          priority,
          isDone: false,
          source: 'ai' as const,
          sectionKey: options.sectionKey,
          generationId: options.generationId,
        };
      });
    } catch (err) {
      this.logger.error(`AI daily task generation failed: ${(err as Error).message}`);
      return [];
    }
  }

  private toJsonTasks(tasks: DailyTaskItem[]): Prisma.InputJsonValue {
    return tasks as unknown as Prisma.InputJsonValue;
  }

  private normalizePriority(value: unknown): DailyTaskPriority {
    if (value === 'HIGH' || value === 'MEDIUM' || value === 'LOW') {
      return value;
    }
    return 'MEDIUM';
  }

  private parseTasks(raw: unknown): DailyTaskItem[] {
    if (!Array.isArray(raw)) {
      return [];
    }

    return raw.map((item, index) => {
      const entry = item as Record<string, unknown>;
      return {
        id: String(entry.id || `dt-legacy-${index}`),
        text: String(entry.text || ''),
        description: typeof entry.description === 'string' ? entry.description : undefined,
        priority: this.normalizePriority(entry.priority),
        isDone: Boolean(entry.isDone),
        source: (entry.source as DailyTaskItem['source']) || 'daily',
        actionStepId:
          typeof entry.actionStepId === 'string' ? entry.actionStepId : undefined,
        generationId:
          typeof entry.generationId === 'string' ? entry.generationId : undefined,
        sectionKey: typeof entry.sectionKey === 'string' ? entry.sectionKey : undefined,
      };
    });
  }

  private toResponse(record: {
    id: string;
    userId: string;
    date: Date;
    tasks: unknown;
    regenerateCount: number;
  }): DailyTaskListResponse {
    return {
      id: record.id,
      userId: record.userId,
      date: record.date,
      tasks: this.parseTasks(record.tasks),
      regenerateCount: record.regenerateCount,
      empty: false,
    };
  }
}

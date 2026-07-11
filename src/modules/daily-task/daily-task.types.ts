export type DailyTaskPriority = 'HIGH' | 'MEDIUM' | 'LOW';

export type DailyTaskSource = 'action_step' | 'ai' | 'daily';

export interface DailyTaskItem {
  id: string;
  text: string;
  description?: string;
  priority: DailyTaskPriority;
  isDone: boolean;
  source: DailyTaskSource;
  actionStepId?: string;
  generationId?: string;
  sectionKey?: string;
}

export interface DailyTaskListResponse {
  id?: string;
  userId?: string;
  date?: Date;
  tasks: DailyTaskItem[];
  regenerateCount?: number;
  empty?: boolean;
  message?: string;
}

/** Safety ceiling only — lists grow per section (4 steps each), not capped at 5. */
export const SOFT_CAP_DAILY_TASKS = 50;
export const AI_TASKS_ON_SYNC = 2;
export const AI_TASKS_ON_REPLENISH = 2;

import { Injectable } from '@nestjs/common';
import { DailyTask, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BaseRepository } from '../../common/repositories/base.repository';

@Injectable()
export class DailyTaskRepository extends BaseRepository<DailyTask> {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma, 'dailyTask');
  }

  async findByProfileAndDate(businessProfileId: string, date: Date) {
    return this.prisma.dailyTask.findUnique({
      where: {
        businessProfileId_date: {
          businessProfileId,
          date,
        },
      },
    });
  }

  async findById(id: string) {
    return this.prisma.dailyTask.findUnique({
      where: { id },
    });
  }

  async hasAnyGeneration(businessProfileId: string) {
    const count = await this.prisma.generation.count({
      where: { businessProfileId },
    });
    return count > 0;
  }

  async findActionStepsForGeneration(generationId: string) {
    return this.prisma.actionStep.findMany({
      where: { generationId, isDone: false },
      include: {
        generation: {
          include: { section: true },
        },
      },
      orderBy: { order: 'asc' },
    });
  }

  async findPendingActionStepsFromToday(businessProfileId: string, startOfDay: Date) {
    return this.prisma.actionStep.findMany({
      where: {
        isDone: false,
        generation: {
          businessProfileId,
          createdAt: { gte: startOfDay },
        },
      },
      include: {
        generation: {
          include: { section: true },
        },
      },
      orderBy: [{ generation: { createdAt: 'asc' } }, { order: 'asc' }],
    });
  }

  async findAllPendingActionSteps(businessProfileId: string) {
    return this.prisma.actionStep.findMany({
      where: {
        isDone: false,
        generation: { businessProfileId },
      },
      include: {
        generation: {
          include: { section: true },
        },
      },
      orderBy: [{ generation: { createdAt: 'desc' } }, { order: 'asc' }],
    });
  }

  async findTodaysGenerations(businessProfileId: string, startOfDay: Date) {
    return this.prisma.generation.findMany({
      where: {
        businessProfileId,
        createdAt: { gte: startOfDay },
      },
      include: {
        section: true,
        actionSteps: { orderBy: { order: 'asc' } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async upsertDailyTask(
    userId: string,
    businessProfileId: string,
    date: Date,
    tasks: Prisma.InputJsonValue,
    regenerateCount?: number,
  ) {
    return this.prisma.dailyTask.upsert({
      where: {
        businessProfileId_date: {
          businessProfileId,
          date,
        },
      },
      update: {
        tasks,
        ...(regenerateCount !== undefined && { regenerateCount }),
      },
      create: {
        userId,
        businessProfileId,
        date,
        tasks,
        regenerateCount: regenerateCount || 0,
      },
    });
  }

  async updateTasks(id: string, tasks: Prisma.InputJsonValue) {
    return this.prisma.dailyTask.update({
      where: { id },
      data: { tasks },
    });
  }

  async updateRegenerateCount(id: string, count: number) {
    return this.prisma.dailyTask.update({
      where: { id },
      data: { regenerateCount: count },
    });
  }
}

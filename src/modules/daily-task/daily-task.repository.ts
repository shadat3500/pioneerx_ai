import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BaseRepository } from '../../common/repositories/base.repository';
import { DailyTask } from '@prisma/client';

@Injectable()
export class DailyTaskRepository extends BaseRepository<DailyTask> {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma, 'dailyTask');
  }

  async findByUserAndDate(userId: string, date: Date) {
    return this.prisma.dailyTask.findUnique({
      where: {
        userId_date: {
          userId,
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

  async upsertDailyTask(userId: string, date: Date, tasks: any, regenerateCount?: number) {
    return this.prisma.dailyTask.upsert({
      where: {
        userId_date: {
          userId,
          date,
        },
      },
      update: {
        tasks,
        ...(regenerateCount !== undefined && { regenerateCount }),
      },
      create: {
        userId,
        date,
        tasks,
        regenerateCount: regenerateCount || 0,
      },
    });
  }

  async updateTasks(id: string, tasks: any) {
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

  async findBusinessProfile(userId: string) {
    return this.prisma.businessProfile.findUnique({
      where: { userId },
    });
  }

  async createBusinessProfile(userId: string) {
    return this.prisma.businessProfile.create({
      data: { userId, currentPhase: 'IDEA' },
    });
  }

  async getActiveUserIds(limit: number = 100): Promise<string[]> {
    const users = await this.prisma.user.findMany({
      select: { id: true },
      take: limit,
    });
    return users.map((u) => u.id);
  }
}

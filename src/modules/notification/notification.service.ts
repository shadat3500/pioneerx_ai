import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export type NotificationType = 'credit_low' | 'model_update' | 'platform_update';

@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async listUnread(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId, isRead: false },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async markRead(userId: string, id: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, userId },
    });
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
  }

  async markAllRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return { updated: result.count };
  }

  /** Used by admin broadcast — creates one notification per active user. */
  async broadcast(type: NotificationType, message: string) {
    const users = await this.prisma.user.findMany({ select: { id: true } });

    await this.prisma.notification.createMany({
      data: users.map((u) => ({
        userId: u.id,
        type,
        message,
      })),
    });

    return { recipients: users.length };
  }
}

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ConversationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findSectionByKey(key: string) {
    return this.prisma.section.findUnique({ where: { key } });
  }

  async findUserWithSubscription(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: { subscription: true },
    });
  }

  async findActivePromptTemplate(sectionId: string) {
    return this.prisma.promptTemplate.findFirst({
      where: { sectionId, isActive: true },
      orderBy: { version: 'desc' },
    });
  }

  async findConversation(userId: string, businessProfileId: string, sectionId: string) {
    return this.prisma.conversation.findUnique({
      where: {
        userId_businessProfileId_sectionId: {
          userId,
          businessProfileId,
          sectionId,
        },
      },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        section: true,
        generations: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            actionSteps: { orderBy: { order: 'asc' } },
          },
        },
      },
    });
  }

  async createConversation(userId: string, businessProfileId: string, sectionId: string) {
    return this.prisma.conversation.create({
      data: { userId, businessProfileId, sectionId },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        section: true,
        generations: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            actionSteps: { orderBy: { order: 'asc' } },
          },
        },
      },
    });
  }

  async createMessage(
    conversationId: string,
    role: 'user' | 'assistant',
    content: string,
    imageUrl?: string | null,
  ) {
    return this.prisma.message.create({
      data: {
        conversationId,
        role,
        content,
        ...(imageUrl ? { imageUrl } : {}),
      },
    });
  }

  async findLastMessages(conversationId: string, limit: number) {
    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return messages.reverse();
  }

  async createFullGeneration(data: {
    userId: string;
    businessProfileId: string;
    sectionId: string;
    conversationId: string;
    userPrompt: string;
    proposerResponses: unknown;
    aggregatedResult: unknown;
    actionSteps: { text: string; description?: string }[];
  }) {
    return this.prisma.$transaction(async (tx) => {
      const generation = await tx.generation.create({
        data: {
          userId: data.userId,
          businessProfileId: data.businessProfileId,
          sectionId: data.sectionId,
          conversationId: data.conversationId,
          userPrompt: data.userPrompt,
          proposerResponses: data.proposerResponses as any,
          aggregatedResult: data.aggregatedResult as any,
          isSaved: false,
        },
      });

      await tx.actionStep.createMany({
        data: data.actionSteps.map((step, idx) => ({
          generationId: generation.id,
          text: step.text,
          description: step.description || '',
          isDone: false,
          order: idx + 1,
        })),
      });

      return generation;
    });
  }
}

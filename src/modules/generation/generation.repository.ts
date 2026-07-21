import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BaseRepository } from '../../common/repositories/base.repository';
import { Generation } from '@prisma/client';

@Injectable()
export class GenerationRepository extends BaseRepository<Generation> {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma, 'generation');
  }

  async findGenerationDetails(id: string, userId: string) {
    return this.prisma.generation.findFirst({
      where: { id, userId },
      include: {
        actionSteps: { orderBy: { order: 'asc' } },
        // v1.5 §7c — include the linked conversation with its messages
        conversation: {
          include: {
            messages: { orderBy: { createdAt: 'asc' } },
          },
        },
      },
    });
  }

  async updateIsSaved(id: string, isSaved: boolean) {
    return this.prisma.generation.update({
      where: { id },
      data: { isSaved },
    });
  }

  async upsertSavedOutput(
    userId: string,
    businessProfileId: string,
    generationId: string,
    label: string,
  ) {
    return this.prisma.savedOutput.upsert({
      where: { generationId },
      update: { label, businessProfileId },
      create: {
        userId,
        businessProfileId,
        generationId,
        label,
      },
    });
  }

  async findSavedOutput(generationId: string) {
    return this.prisma.savedOutput.findUnique({
      where: { generationId },
    });
  }

  async deleteSavedOutput(generationId: string) {
    return this.prisma.savedOutput.delete({
      where: { generationId },
    });
  }

  async getSavedOutputs(userId: string, businessProfileId: string, sectionId?: string) {
    return this.prisma.savedOutput.findMany({
      where: {
        userId,
        businessProfileId,
        // v1.5 §7b — filter by the current section when provided
        ...(sectionId && { generation: { sectionId } }),
      },
      include: {
        generation: {
          include: {
            section: true,
            actionSteps: { orderBy: { order: 'asc' } },
            conversation: {
              include: {
                messages: { orderBy: { createdAt: 'asc' } },
              },
            },
          },
        },
      },
      orderBy: { savedAt: 'desc' },
    });
  }

  async findSectionByKey(key: string) {
    return this.prisma.section.findUnique({ where: { key } });
  }
}

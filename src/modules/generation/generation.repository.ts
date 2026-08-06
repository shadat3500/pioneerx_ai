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
      update: { label, businessProfileId, savedAt: new Date() },
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

  async findSavedOutputById(id: string) {
    return this.prisma.savedOutput.findUnique({ where: { id } });
  }

  async repointSavedOutput(
    savedOutputId: string,
    newGenerationId: string,
    businessProfileId: string,
    label: string,
  ) {
    return this.prisma.savedOutput.update({
      where: { id: savedOutputId },
      data: {
        generationId: newGenerationId,
        businessProfileId,
        label,
        savedAt: new Date(),
      },
    });
  }

  async updateSavedOutputMeta(savedOutputId: string, label: string) {
    return this.prisma.savedOutput.update({
      where: { id: savedOutputId },
      data: { label, savedAt: new Date() },
    });
  }

  async findActivePointer(userId: string, businessProfileId: string, sectionId: string) {
    return this.prisma.activeConversation.findUnique({
      where: {
        userId_businessProfileId_sectionId: {
          userId,
          businessProfileId,
          sectionId,
        },
      },
    });
  }

  async setActiveSavedOutputId(
    userId: string,
    businessProfileId: string,
    sectionId: string,
    savedOutputId: string | null,
  ) {
    return this.prisma.activeConversation.update({
      where: {
        userId_businessProfileId_sectionId: {
          userId,
          businessProfileId,
          sectionId,
        },
      },
      data: { savedOutputId },
    });
  }

  async clearActiveSavedOutputReferences(savedOutputId: string) {
    return this.prisma.activeConversation.updateMany({
      where: { savedOutputId },
      data: { savedOutputId: null },
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

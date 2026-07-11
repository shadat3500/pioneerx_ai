import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BaseRepository } from '../../common/repositories/base.repository';
import { Generation } from '@prisma/client';

@Injectable()
export class GenerationRepository extends BaseRepository<Generation> {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma, 'generation');
  }

  async findSectionByKey(key: string) {
    return this.prisma.section.findUnique({
      where: { key },
    });
  }

  async findUserForGeneration(userId: string) {
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

  async findActiveTools(sectionId: string) {
    return this.prisma.toolCatalogItem.findMany({
      where: { sectionId, isActive: true },
    });
  }

  async createFullGeneration(data: {
    userId: string;
    businessProfileId: string;
    sectionId: string;
    userPrompt: string;
    proposerResponses: any;
    aggregatedResult: any;
    actionSteps: any[];
  }) {
    return this.prisma.$transaction(async (tx) => {
      const generation = await tx.generation.create({
        data: {
          userId: data.userId,
          businessProfileId: data.businessProfileId,
          sectionId: data.sectionId,
          userPrompt: data.userPrompt,
          proposerResponses: data.proposerResponses,
          aggregatedResult: data.aggregatedResult,
          isSaved: false,
        },
      });

      const actionSteps = data.actionSteps.map((step, idx) => ({
        generationId: generation.id,
        text: step.text,
        description: step.description || '',
        isDone: false,
        order: idx + 1,
      }));

      await tx.actionStep.createMany({
        data: actionSteps,
      });

      return generation;
    });
  }

  async findGenerationDetails(id: string, userId: string) {
    return this.prisma.generation.findFirst({
      where: { id, userId },
      include: { actionSteps: { orderBy: { order: 'asc' } } },
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

  async getSavedOutputs(userId: string, businessProfileId: string) {
    return this.prisma.savedOutput.findMany({
      where: { userId, businessProfileId },
      include: {
        generation: {
          include: {
            section: true,
            actionSteps: { orderBy: { order: 'asc' } },
          },
        },
      },
      orderBy: { savedAt: 'desc' },
    });
  }
}

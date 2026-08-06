import { Injectable, NotFoundException } from '@nestjs/common';
import { GenerationRepository } from './generation.repository';
import { BusinessProfileService } from '../business-profile/business-profile.service';
import { ConversationService } from '../conversation/conversation.service';

@Injectable()
export class GenerationService {
  constructor(
    private readonly repository: GenerationRepository,
    private readonly businessProfileService: BusinessProfileService,
    private readonly conversationService: ConversationService,
  ) {}

  async findOne(userId: string, id: string) {
    const generation = await this.repository.findGenerationDetails(id, userId);
    if (!generation) {
      throw new NotFoundException('Generation not found');
    }
    return generation;
  }

  /**
   * Save (or update) a generation as a SavedOutput.
   * If the active chat session was opened from a saved output, that row is updated
   * to point at this generation instead of creating a duplicate.
   */
  async saveOutput(userId: string, generationId: string, label?: string) {
    const generation = await this.repository.findGenerationDetails(generationId, userId);
    if (!generation) {
      throw new NotFoundException('Generation not found');
    }

    const resolvedLabel = label || 'Saved Advisory Output';
    const active = await this.repository.findActivePointer(
      userId,
      generation.businessProfileId,
      generation.sectionId,
    );

    if (active?.savedOutputId) {
      const existing = await this.repository.findSavedOutputById(active.savedOutputId);
      if (existing && existing.userId === userId) {
        if (existing.generationId !== generationId) {
          await this.repository.updateIsSaved(existing.generationId, false);
          await this.repository.updateIsSaved(generationId, true);
          return this.repository.repointSavedOutput(
            existing.id,
            generationId,
            generation.businessProfileId,
            resolvedLabel,
          );
        }

        await this.repository.updateIsSaved(generationId, true);
        return this.repository.updateSavedOutputMeta(existing.id, resolvedLabel);
      }
    }

    await this.repository.updateIsSaved(generationId, true);

    const saved = await this.repository.upsertSavedOutput(
      userId,
      generation.businessProfileId,
      generationId,
      resolvedLabel,
    );

    if (active) {
      await this.repository.setActiveSavedOutputId(
        userId,
        generation.businessProfileId,
        generation.sectionId,
        saved.id,
      );
    }

    return saved;
  }

  async unsaveOutput(userId: string, generationId: string) {
    const saved = await this.repository.findSavedOutput(generationId);
    if (!saved || saved.userId !== userId) {
      throw new NotFoundException('Saved output not found');
    }

    await this.repository.updateIsSaved(generationId, false);
    await this.repository.clearActiveSavedOutputReferences(saved.id);

    return this.repository.deleteSavedOutput(generationId);
  }

  async getSavedOutputs(userId: string, sectionKey?: string) {
    const activeProfile = await this.businessProfileService.resolveActiveProfile(userId);

    let sectionId: string | undefined;
    if (sectionKey) {
      const section = await this.repository.findSectionByKey(sectionKey);
      if (!section) {
        throw new NotFoundException(`Section not found: ${sectionKey}`);
      }
      sectionId = section.id;
    }

    return this.repository.getSavedOutputs(userId, activeProfile.id, sectionId);
  }

  async openSavedOutput(userId: string, savedOutputId: string) {
    return this.conversationService.openSavedOutput(userId, savedOutputId);
  }
}

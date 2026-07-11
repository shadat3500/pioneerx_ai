import { Injectable, NotFoundException } from '@nestjs/common';
import { GenerationRepository } from './generation.repository';
import { BusinessProfileService } from '../business-profile/business-profile.service';

@Injectable()
export class GenerationService {
  constructor(
    private readonly repository: GenerationRepository,
    private readonly businessProfileService: BusinessProfileService,
  ) {}

  async findOne(userId: string, id: string) {
    const generation = await this.repository.findGenerationDetails(id, userId);
    if (!generation) {
      throw new NotFoundException('Generation not found');
    }
    return generation;
  }

  async saveOutput(userId: string, generationId: string, label?: string) {
    const generation = await this.repository.findGenerationDetails(generationId, userId);
    if (!generation) {
      throw new NotFoundException('Generation not found');
    }

    await this.repository.updateIsSaved(generationId, true);

    return this.repository.upsertSavedOutput(
      userId,
      generation.businessProfileId,
      generationId,
      label || 'Saved Advisory Output',
    );
  }

  async unsaveOutput(userId: string, generationId: string) {
    const saved = await this.repository.findSavedOutput(generationId);
    if (!saved || saved.userId !== userId) {
      throw new NotFoundException('Saved output not found');
    }

    await this.repository.updateIsSaved(generationId, false);

    return this.repository.deleteSavedOutput(generationId);
  }

  async getSavedOutputs(userId: string) {
    const activeProfile = await this.businessProfileService.resolveActiveProfile(userId);
    return this.repository.getSavedOutputs(userId, activeProfile.id);
  }
}

import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BusinessProfileRepository } from './business-profile.repository';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CreateProfileDto } from './dto/create-profile.dto';
import { BusinessProfile } from '@prisma/client';

@Injectable()
export class BusinessProfileService {
  constructor(private readonly repository: BusinessProfileRepository) {}

  async getProfileContext(userId: string) {
    await this.repository.createDefaultProfileForUser(userId);
    const profiles = await this.repository.findAllByUserId(userId);
    const activeProfile = await this.repository.resolveActiveProfile(userId);

    return {
      activeProfile,
      profiles,
    };
  }

  /** @deprecated Use getProfileContext — kept for backward-compatible GET /profile */
  async getProfile(userId: string) {
    return this.getProfileContext(userId);
  }

  async updateActiveProfile(userId: string, dto: UpdateProfileDto) {
    const activeProfile = await this.repository.resolveActiveProfile(userId);
    return this.repository.updateProfile(activeProfile.id, userId, dto);
  }

  async createProfile(userId: string, dto: CreateProfileDto) {
    const count = await this.repository.countByUserId(userId);
    const profile = await this.repository.createProfile(userId, dto);

    if (count === 0) {
      await this.repository.setActiveProfile(userId, profile.id);
    }

    return profile;
  }

  async listProfiles(userId: string) {
    return this.repository.findAllByUserId(userId);
  }

  async getProfileById(userId: string, profileId: string) {
    const profile = await this.repository.findByIdForUser(profileId, userId);
    if (!profile) {
      throw new NotFoundException('Business profile not found');
    }
    return profile;
  }

  async updateProfileById(userId: string, profileId: string, dto: UpdateProfileDto) {
    await this.getProfileById(userId, profileId);
    return this.repository.updateProfile(profileId, userId, dto);
  }

  async deleteProfile(userId: string, profileId: string) {
    const count = await this.repository.countByUserId(userId);
    if (count <= 1) {
      throw new ForbiddenException('Cannot delete your only business profile');
    }

    const user = await this.repository.findUserWithActiveProfile(userId);
    await this.getProfileById(userId, profileId);

    await this.repository.deleteProfile(profileId, userId);

    if (user?.activeProfileId === profileId) {
      const remaining = await this.repository.findAllByUserId(userId);
      if (remaining.length > 0) {
        await this.repository.setActiveProfile(userId, remaining[0].id);
      }
    }

    return { message: 'Business profile deleted' };
  }

  async activateProfile(userId: string, profileId: string) {
    await this.getProfileById(userId, profileId);
    await this.repository.setActiveProfile(userId, profileId);
    return this.repository.findByIdForUser(profileId, userId);
  }

  async resolveActiveProfile(userId: string): Promise<BusinessProfile> {
    return this.repository.resolveActiveProfile(userId);
  }
}

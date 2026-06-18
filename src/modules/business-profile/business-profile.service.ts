import { Injectable } from '@nestjs/common';
import { BusinessProfileRepository } from './business-profile.repository';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class BusinessProfileService {
  constructor(private readonly repository: BusinessProfileRepository) {}

  async getProfile(userId: string) {
    let profile = await this.repository.findByUserId(userId);

    if (!profile) {
      // Create a default profile if it doesn't exist yet
      profile = await this.repository.upsertProfile(userId, {
        currentPhase: 'IDEA',
      });
    }

    return profile;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    return this.repository.upsertProfile(userId, dto);
  }
}

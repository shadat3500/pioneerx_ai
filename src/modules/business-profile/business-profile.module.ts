import { Module } from '@nestjs/common';
import { BusinessProfileController } from './business-profile.controller';
import { BusinessProfileService } from './business-profile.service';
import { BusinessProfileRepository } from './business-profile.repository';
import { BusinessBriefService } from './business-brief.service';
import { AiProviderModule } from '../ai-provider/ai-provider.module';

@Module({
  imports: [AiProviderModule],
  controllers: [BusinessProfileController],
  providers: [BusinessProfileService, BusinessProfileRepository, BusinessBriefService],
  exports: [BusinessProfileService, BusinessProfileRepository, BusinessBriefService],
})
export class BusinessProfileModule {}

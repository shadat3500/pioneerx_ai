import { Module, forwardRef } from '@nestjs/common';
import { GenerationController } from './generation.controller';
import { GenerationService } from './generation.service';
import { GenerationRepository } from './generation.repository';
import { BusinessProfileModule } from '../business-profile/business-profile.module';
import { ConversationModule } from '../conversation/conversation.module';

@Module({
  imports: [BusinessProfileModule, forwardRef(() => ConversationModule)],
  controllers: [GenerationController],
  providers: [GenerationService, GenerationRepository],
  exports: [GenerationService, GenerationRepository],
})
export class GenerationModule {}

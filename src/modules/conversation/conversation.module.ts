import { Module, forwardRef } from '@nestjs/common';
import { ConversationController } from './conversation.controller';
import { ConversationService } from './conversation.service';
import { ConversationRepository } from './conversation.repository';
import { AiProviderModule } from '../ai-provider/ai-provider.module';
import { TokenModule } from '../token/token.module';
import { BusinessProfileModule } from '../business-profile/business-profile.module';
import { DailyTaskModule } from '../daily-task/daily-task.module';
import { SectionAccessGuard } from '../generation/guards/section-access.guard';

@Module({
  imports: [
    AiProviderModule,
    TokenModule,
    BusinessProfileModule,
    forwardRef(() => DailyTaskModule),
  ],
  controllers: [ConversationController],
  providers: [ConversationService, ConversationRepository, SectionAccessGuard],
  exports: [ConversationService],
})
export class ConversationModule {}

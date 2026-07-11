import { Module, forwardRef } from '@nestjs/common';
import { GenerationController } from './generation.controller';
import { GenerationService } from './generation.service';
import { GenerationRepository } from './generation.repository';
import { AiProviderModule } from '../ai-provider/ai-provider.module';
import { TokenModule } from '../token/token.module';
import { DailyTaskModule } from '../daily-task/daily-task.module';
import { BusinessProfileModule } from '../business-profile/business-profile.module';

@Module({
  imports: [
    AiProviderModule,
    TokenModule,
    BusinessProfileModule,
    forwardRef(() => DailyTaskModule),
  ],
  controllers: [GenerationController],
  providers: [GenerationService, GenerationRepository],
  exports: [GenerationService, GenerationRepository],
})
export class GenerationModule {}

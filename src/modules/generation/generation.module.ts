import { Module } from '@nestjs/common';
import { GenerationController } from './generation.controller';
import { GenerationService } from './generation.service';
import { GenerationRepository } from './generation.repository';
import { AiProviderModule } from '../ai-provider/ai-provider.module';

@Module({
  imports: [AiProviderModule],
  controllers: [GenerationController],
  providers: [GenerationService, GenerationRepository],
  exports: [GenerationService, GenerationRepository],
})
export class GenerationModule {}

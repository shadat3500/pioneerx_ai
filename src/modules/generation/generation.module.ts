import { Module } from '@nestjs/common';
import { GenerationController } from './generation.controller';
import { GenerationService } from './generation.service';
import { GenerationRepository } from './generation.repository';
import { BusinessProfileModule } from '../business-profile/business-profile.module';

@Module({
  imports: [BusinessProfileModule],
  controllers: [GenerationController],
  providers: [GenerationService, GenerationRepository],
  exports: [GenerationService, GenerationRepository],
})
export class GenerationModule {}

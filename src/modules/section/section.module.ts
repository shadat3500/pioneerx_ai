import { Module } from '@nestjs/common';
import { SectionController } from './section.controller';
import { SectionService } from './section.service';
import { SectionRepository } from './section.repository';

@Module({
  controllers: [SectionController],
  providers: [SectionService, SectionRepository],
  exports: [SectionService, SectionRepository],
})
export class SectionModule {}

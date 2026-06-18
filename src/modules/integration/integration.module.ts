import { Module } from '@nestjs/common';
import { IntegrationController } from './integration.controller';
import { IntegrationService } from './integration.service';
import { IntegrationRepository } from './integration.repository';

@Module({
  controllers: [IntegrationController],
  providers: [IntegrationService, IntegrationRepository],
  exports: [IntegrationService, IntegrationRepository],
})
export class IntegrationModule {}

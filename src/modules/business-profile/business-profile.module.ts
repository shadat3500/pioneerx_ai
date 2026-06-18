import { Module } from '@nestjs/common';
import { BusinessProfileController } from './business-profile.controller';
import { BusinessProfileService } from './business-profile.service';
import { BusinessProfileRepository } from './business-profile.repository';

@Module({
  controllers: [BusinessProfileController],
  providers: [BusinessProfileService, BusinessProfileRepository],
  exports: [BusinessProfileService, BusinessProfileRepository],
})
export class BusinessProfileModule {}

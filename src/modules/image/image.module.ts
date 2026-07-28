import { Module } from '@nestjs/common';
import { ImageService } from './image.service';
import { ImageController } from './image.controller';
import { CreditModule } from '../credit/credit.module';
import { BusinessProfileModule } from '../business-profile/business-profile.module';
import { ConversationModule } from '../conversation/conversation.module';

@Module({
  imports: [CreditModule, BusinessProfileModule, ConversationModule],
  controllers: [ImageController],
  providers: [ImageService],
})
export class ImageModule {}

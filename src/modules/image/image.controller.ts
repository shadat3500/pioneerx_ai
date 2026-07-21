import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ImageService } from './image.service';
import { GenerateImageDto } from './dto/generate-image.dto';
import { GetCurrentUser } from '../auth/decorators/get-current-user.decorator';

@ApiTags('Image')
@ApiBearerAuth()
@Controller('image')
export class ImageController {
  constructor(private readonly imageService: ImageService) {}

  @Post('generate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate a logo or business card image (40 credits)' })
  generate(@GetCurrentUser('sub') userId: string, @Body() dto: GenerateImageDto) {
    return this.imageService.generate(userId, dto);
  }
}

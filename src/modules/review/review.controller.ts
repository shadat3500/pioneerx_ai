import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReviewService } from './review.service';
import { SubmitReviewDto } from './dto/submit-review.dto';
import { GetCurrentUser } from '../auth/decorators/get-current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('Reviews')
@Controller('reviews')
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @Public()
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List approved reviews (public)' })
  findApproved() {
    return this.reviewService.findApproved();
  }

  @ApiBearerAuth()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit a review (pending approval)' })
  submit(@GetCurrentUser('sub') userId: string, @Body() dto: SubmitReviewDto) {
    return this.reviewService.submit(userId, dto);
  }
}

import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { StripeWebhookService } from './stripe-webhook.service';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('Billing')
@Controller('webhooks')
export class StripeWebhookController {
  constructor(private readonly webhookService: StripeWebhookService) {}

  // Stripe bursts well past the global 10 req/min throttle during retries.
  @Public()
  @SkipThrottle()
  @Post('stripe')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  handle(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    return this.webhookService.handle(req.rawBody, signature);
  }
}

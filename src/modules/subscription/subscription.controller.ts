import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SubscriptionService } from './subscription.service';
import { GetCurrentUser } from '../auth/decorators/get-current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('Subscription')
@Controller()
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Public()
  @Post('webhooks/revenuecat')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'RevenueCat purchase updates webhook handler' })
  handleWebhook(@Headers() headers: any, @Body() body: any) {
    return this.subscriptionService.handleWebhook(headers, body);
  }

  @ApiBearerAuth()
  @Get('subscription/me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get current user entitlement details' })
  getSubscription(@GetCurrentUser('sub') userId: string) {
    return this.subscriptionService.getSubscriptionForUser(userId);
  }
}

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto';
import { GetCurrentUser } from '../auth/decorators/get-current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('Billing')
@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Public()
  @Get('plans')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List active Stripe plans (public pricing table)' })
  listPlans() {
    return this.billingService.listPlans();
  }

  @ApiBearerAuth()
  @Post('checkout-session')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start Stripe Checkout for a plan → returns redirect url' })
  createCheckoutSession(
    @GetCurrentUser('sub') userId: string,
    @Body() dto: CreateCheckoutSessionDto,
  ) {
    return this.billingService.createCheckoutSession(userId, dto);
  }

  @ApiBearerAuth()
  @Post('portal-session')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Open Stripe Billing Portal (manage / cancel plan)' })
  createPortalSession(@GetCurrentUser('sub') userId: string) {
    return this.billingService.createPortalSession(userId);
  }

  @ApiBearerAuth()
  @Get('checkout-session/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm a checkout session on the success page' })
  getCheckoutSession(
    @GetCurrentUser('sub') userId: string,
    @Param('id') sessionId: string,
  ) {
    return this.billingService.getCheckoutSession(userId, sessionId);
  }

  @ApiBearerAuth()
  @Get('payments')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Payment history for the current user' })
  listPayments(@GetCurrentUser('sub') userId: string) {
    return this.billingService.listPayments(userId);
  }
}

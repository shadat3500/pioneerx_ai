import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PromoService } from './promo.service';
import { ApplyPromoDto } from './dto/promo.dto';
import { GetCurrentUser } from '../auth/decorators/get-current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('Promo')
@Controller()
export class PromoController {
  constructor(private readonly promoService: PromoService) {}

  @Public()
  @Get('promo-codes')
  @ApiOperation({ summary: 'List active promo codes for the public website' })
  listPublicPromoCodes() {
    return this.promoService.listActivePublicPromoCodes();
  }

  @ApiBearerAuth()
  @Post('auth/apply-promo')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Apply a promo code to extend trial (logged-in user)' })
  applyPromo(@GetCurrentUser('sub') userId: string, @Body() dto: ApplyPromoDto) {
    return this.promoService.applyPromoCode(userId, dto.code);
  }
}

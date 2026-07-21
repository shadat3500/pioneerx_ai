import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PromoService } from './promo.service';
import { ApplyPromoDto } from './dto/promo.dto';
import { GetCurrentUser } from '../auth/decorators/get-current-user.decorator';

@ApiTags('Promo')
@ApiBearerAuth()
@Controller('auth')
export class PromoController {
  constructor(private readonly promoService: PromoService) {}

  @Post('apply-promo')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Apply a promo code to extend trial (logged-in user)' })
  applyPromo(@GetCurrentUser('sub') userId: string, @Body() dto: ApplyPromoDto) {
    return this.promoService.applyPromoCode(userId, dto.code);
  }
}

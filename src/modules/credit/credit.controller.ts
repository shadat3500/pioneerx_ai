import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreditService } from './credit.service';
import { GetCurrentUser } from '../auth/decorators/get-current-user.decorator';

@ApiTags('Credits')
@ApiBearerAuth()
@Controller()
export class CreditController {
  constructor(private readonly creditService: CreditService) {}

  @Get('credit-status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get current credit balance, limit, and reset time' })
  getStatus(@GetCurrentUser('sub') userId: string) {
    return this.creditService.getStatus(userId);
  }
}

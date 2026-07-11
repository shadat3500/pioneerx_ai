import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GetCurrentUser } from '../auth/decorators/get-current-user.decorator';
import { TokenService } from './token.service';

@ApiTags('Token')
@Controller()
export class TokenController {
  constructor(private readonly tokenService: TokenService) {}

  @ApiBearerAuth()
  @Get('token-status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Get today's token usage summary for the current user" })
  getTokenStatus(@GetCurrentUser('sub') userId: string) {
    return this.tokenService.getTokenStatusForUser(userId);
  }
}

import { Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { IntegrationService } from './integration.service';
import { GetCurrentUser } from '../auth/decorators/get-current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('Integrations')
@ApiBearerAuth()
@Controller('integrations')
export class IntegrationController {
  constructor(private readonly integrationService: IntegrationService) {}

  @Get('shopify/connect')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get Shopify OAuth authorization URL' })
  @ApiQuery({ name: 'shop', description: 'Shopify store domain e.g. mystore.myshopify.com' })
  getShopifyAuthUrl(
    @GetCurrentUser('sub') userId: string,
    @Query('shop') shop: string,
  ) {
    const url = this.integrationService.getShopifyAuthUrl(shop, userId);
    return { authUrl: url };
  }

  @Public()
  @Get('shopify/callback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Shopify OAuth callback handler' })
  async handleShopifyCallback(@Query() query: any) {
    const { shop, code, state: userId } = query;
    return this.integrationService.handleShopifyCallback(shop, code, userId);
  }

  @Get('shopify/metrics')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get Shopify e-commerce metrics (revenue, orders, customers)' })
  getShopifyMetrics(@GetCurrentUser('sub') userId: string) {
    return this.integrationService.getShopifyMetrics(userId);
  }

  @Post('shopify/disconnect')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Disconnect Shopify integration' })
  disconnectShopify(@GetCurrentUser('sub') userId: string) {
    return this.integrationService.disconnectShopify(userId);
  }
}

import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { IntegrationRepository } from './integration.repository';
import { ConfigService } from '@nestjs/config';
import { CryptoUtil } from '../../common/utils/crypto.util';
import { IntegrationProvider } from '@prisma/client';
import axios from 'axios';

@Injectable()
export class IntegrationService {
  private readonly logger = new Logger(IntegrationService.name);

  constructor(
    private readonly repository: IntegrationRepository,
    private readonly config: ConfigService,
  ) { }

  /**
   * Generates authorization URL to start Shopify OAuth flow
   */
  getShopifyAuthUrl(shop: string, userId: string): string {
    const apiKey = this.config.get<string>('SHOPIFY_API_KEY');
    const baseUrl = this.config.get<string>('BASE_URL') || 'http://localhost:8083';
    const redirectUri = `${baseUrl}/api/v1/integrations/shopify/callback`;
    const scopes = 'read_orders,read_customers';
    const state = userId; // simple tracking state

    if (!apiKey) {
      this.logger.warn('SHOPIFY_API_KEY is missing. OAuth redirect will use dummy placeholders.');
    }

    return `https://${shop}/admin/oauth/authorize?client_id=${apiKey || 'dummy'}&scope=${scopes}&redirect_uri=${redirectUri}&state=${state}`;
  }

  /**
   * Exchanges temporary OAuth code for access token and saves it encrypted
   */
  async handleShopifyCallback(shop: string, code: string, userId: string) {
    const apiKey = this.config.get<string>('SHOPIFY_API_KEY');
    const apiSecret = this.config.get<string>('SHOPIFY_API_SECRET');

    if (!apiKey || !apiSecret) {
      // Create a mock connection for developer flow
      this.logger.warn('Missing Shopify API keys. Creating a mock integration connection.');
      const mockTokenEncrypted = CryptoUtil.encrypt('mock-shopify-access-token');

      return this.repository.upsertMockIntegration(
        `mock-shopify-${userId}`,
        userId,
        IntegrationProvider.SHOPIFY,
        mockTokenEncrypted,
        shop,
      );
    }

    try {
      const response = await axios.post(`https://${shop}/admin/oauth/access_token`, {
        client_id: apiKey,
        client_secret: apiSecret,
        code,
      });

      const accessToken = response.data.access_token;
      if (!accessToken) {
        throw new BadRequestException('Failed to retrieve access token from Shopify');
      }

      // Encrypt accessToken before storing
      const encryptedToken = CryptoUtil.encrypt(accessToken);

      return await this.repository.createIntegration({
        userId,
        provider: IntegrationProvider.SHOPIFY,
        accessToken: encryptedToken,
        refreshToken: shop, // using refreshToken column to store shop URL
        status: 'connected',
      });
    } catch (err) {
      this.logger.error(`Shopify Token Exchange Error: ${(err as any).message}`);
      throw new BadRequestException(`Shopify connection failed: ${(err as any).message}`);
    }
  }

  /**
   * Retrieves aggregated Shopify metrics (orders and customers) or returns mock demo metrics
   */
  async getShopifyMetrics(userId: string) {
    const integration = await this.repository.findByUserIdAndProvider(
      userId,
      IntegrationProvider.SHOPIFY,
    );

    if (!integration) {
      // Return a demo mock metrics response if not connected
      return {
        connected: false,
        revenue: 0,
        orderCount: 0,
        customerCount: 0,
        growthRate: 0,
        message: 'Shopify is not integrated. Connect your store to view live metrics.',
      };
    }

    const decryptedToken = CryptoUtil.decrypt(integration.accessToken);
    const shop = integration.refreshToken; // stores shop domain name

    // If it's a mock token, return mock analytics values
    if (decryptedToken === 'mock-shopify-access-token' || !shop) {
      return {
        connected: true,
        revenue: 24590.80,
        orderCount: 184,
        customerCount: 112,
        growthRate: 18.5,
        isMockData: true,
      };
    }

    try {
      // 1. Fetch Orders
      const ordersRes = await axios.get(
        `https://${shop}/admin/api/2024-04/orders.json?status=any&limit=250`,
        { headers: { 'X-Shopify-Access-Token': decryptedToken } },
      );
      const orders = ordersRes.data.orders || [];

      // 2. Fetch Customers
      const customersRes = await axios.get(
        `https://${shop}/admin/api/2024-04/customers.json?limit=250`,
        { headers: { 'X-Shopify-Access-Token': decryptedToken } },
      );
      const customers = customersRes.data.customers || [];

      // 3. Compute Metrics
      const totalRevenue = orders.reduce((sum: number, o: any) => sum + parseFloat(o.total_price || '0'), 0);
      const orderCount = orders.length;
      const customerCount = customers.length;

      // Compute simple growth rate (last 30 days orders vs previous 30 days)
      const now = new Date();
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(now.getDate() - 30);
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(now.getDate() - 60);

      const recentOrders = orders.filter((o: any) => new Date(o.created_at) >= thirtyDaysAgo);
      const priorOrders = orders.filter((o: any) => {
        const date = new Date(o.created_at);
        return date >= sixtyDaysAgo && date < thirtyDaysAgo;
      });

      const recentRevenue = recentOrders.reduce((sum: number, o: any) => sum + parseFloat(o.total_price || '0'), 0);
      const priorRevenue = priorOrders.reduce((sum: number, o: any) => sum + parseFloat(o.total_price || '0'), 0);

      let growthRate = 0;
      if (priorRevenue > 0) {
        growthRate = parseFloat((((recentRevenue - priorRevenue) / priorRevenue) * 100).toFixed(2));
      } else if (recentRevenue > 0) {
        growthRate = 100; // 100% growth if there is new revenue and prior was 0
      }

      return {
        connected: true,
        revenue: totalRevenue,
        orderCount,
        customerCount,
        growthRate,
        isMockData: false,
      };
    } catch (err) {
      this.logger.error(`Shopify API Call Error: ${(err as any).message}`);
      throw new BadRequestException(`Failed to retrieve metrics from Shopify: ${(err as any).message}`);
    }
  }

  async disconnectShopify(userId: string) {
    const integration = await this.repository.findFirstByUserAndProvider(
      userId,
      IntegrationProvider.SHOPIFY,
    );

    if (!integration) {
      throw new NotFoundException('Shopify connection not found');
    }

    await this.repository.deleteIntegration(integration.id);

    return { message: 'Shopify integration disconnected successfully' };
  }
}

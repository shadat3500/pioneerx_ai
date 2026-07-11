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
  ) {}

  getShopifyAuthUrl(shop: string, userId: string): string {
    const apiKey = this.config.get<string>('SHOPIFY_API_KEY');
    const baseUrl = this.config.get<string>('BASE_URL') || 'http://localhost:8083';
    const redirectUri = `${baseUrl}/api/v1/integrations/shopify/callback`;
    const scopes = 'read_orders,read_customers';
    const state = userId;

    if (!apiKey) {
      throw new BadRequestException('Shopify integration is not configured (SHOPIFY_API_KEY missing)');
    }

    return `https://${shop}/admin/oauth/authorize?client_id=${apiKey}&scope=${scopes}&redirect_uri=${redirectUri}&state=${state}`;
  }

  async handleShopifyCallback(shop: string, code: string, userId: string) {
    const apiKey = this.config.get<string>('SHOPIFY_API_KEY');
    const apiSecret = this.config.get<string>('SHOPIFY_API_SECRET');

    if (!apiKey || !apiSecret) {
      throw new BadRequestException(
        'Shopify integration is not configured (SHOPIFY_API_KEY or SHOPIFY_API_SECRET missing)',
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

      const encryptedToken = CryptoUtil.encrypt(accessToken);

      return await this.repository.createIntegration({
        userId,
        provider: IntegrationProvider.SHOPIFY,
        accessToken: encryptedToken,
        refreshToken: shop,
        status: 'connected',
      });
    } catch (err) {
      if (err instanceof BadRequestException) {
        throw err;
      }
      this.logger.error(`Shopify Token Exchange Error: ${(err as any).message}`);
      throw new BadRequestException(`Shopify connection failed: ${(err as any).message}`);
    }
  }

  async getShopifyMetrics(userId: string) {
    const integration = await this.repository.findByUserIdAndProvider(
      userId,
      IntegrationProvider.SHOPIFY,
    );

    if (!integration) {
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
    const shop = integration.refreshToken;

    if (!shop) {
      throw new BadRequestException('Shopify shop domain is missing from integration record');
    }

    try {
      const ordersRes = await axios.get(
        `https://${shop}/admin/api/2024-04/orders.json?status=any&limit=250`,
        { headers: { 'X-Shopify-Access-Token': decryptedToken } },
      );
      const orders = ordersRes.data.orders || [];

      const customersRes = await axios.get(
        `https://${shop}/admin/api/2024-04/customers.json?limit=250`,
        { headers: { 'X-Shopify-Access-Token': decryptedToken } },
      );
      const customers = customersRes.data.customers || [];

      const totalRevenue = orders.reduce(
        (sum: number, o: any) => sum + parseFloat(o.total_price || '0'),
        0,
      );
      const orderCount = orders.length;
      const customerCount = customers.length;

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

      const recentRevenue = recentOrders.reduce(
        (sum: number, o: any) => sum + parseFloat(o.total_price || '0'),
        0,
      );
      const priorRevenue = priorOrders.reduce(
        (sum: number, o: any) => sum + parseFloat(o.total_price || '0'),
        0,
      );

      let growthRate = 0;
      if (priorRevenue > 0) {
        growthRate = parseFloat((((recentRevenue - priorRevenue) / priorRevenue) * 100).toFixed(2));
      } else if (recentRevenue > 0) {
        growthRate = 100;
      }

      return {
        connected: true,
        revenue: totalRevenue,
        orderCount,
        customerCount,
        growthRate,
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

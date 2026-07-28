import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AdminRepository } from './admin.repository';
import { AdminLoginDto } from './dto/admin-login.dto';
import { CreateModelPricingDto, UpdateModelPricingDto } from './dto/model-pricing.dto';
import { UpdateQuotaConfigDto } from './dto/quota-config.dto';
import { UpdateCreditConfigDto } from './dto/credit-config.dto';
import { BroadcastNotificationDto } from './dto/broadcast-notification.dto';
import { TokenDashboardQueryDto } from './dto/token-dashboard-query.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { AiProviderService } from '../ai-provider/ai-provider.service';
import { TokenService } from '../token/token.service';
import { NotificationService } from '../notification/notification.service';
import { SitePageService } from '../site-page/site-page.service';
import { UpdateSitePageDto } from '../site-page/dto/update-site-page.dto';
import {
  CreateStripePriceDto,
  UpdateStripePriceDto,
} from './dto/stripe-price.dto';

@Injectable()
export class AdminService {
  constructor(
    private readonly repository: AdminRepository,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly aiProvider: AiProviderService,
    private readonly tokenService: TokenService,
    private readonly notificationService: NotificationService,
    private readonly sitePageService: SitePageService,
  ) { }

  async login(dto: AdminLoginDto) {
    const admin = await this.repository.findByEmail(dto.email);

    if (!admin) {
      throw new ForbiddenException('Invalid credentials');
    }

    const passwordMatches = await bcrypt.compare(dto.password, admin.passwordHash);
    if (!passwordMatches) {
      throw new ForbiddenException('Invalid credentials');
    }

    const payload = {
      sub: admin.id,
      email: admin.email,
      role: 'admin',
    };

    const token = await this.jwtService.signAsync(payload, {
      secret: this.config.get<string>('JWT_AT_SECRET'),
      expiresIn: (this.config.get<string>('JWT_AT_EXPIRES_IN')) as any,
    });

    return {
      access_token: token,
    };
  }

  // Section CRUD
  async getSections() {
    return this.repository.findAllSections();
  }

  async updateSection(id: string, data: any) {
    return this.repository.updateSection(id, data);
  }

  // AiModelConfig CRUD
  async getAiModelConfigs() {
    return this.repository.findAllAiModelConfigs();
  }

  async updateAiModelConfig(id: string, data: any) {
    const updated = await this.repository.updateAiModelConfig(id, data);
    await this.aiProvider.invalidateCache(updated.role);
    return updated;
  }

  // PromptTemplate CRUD
  async getPromptTemplates() {
    return this.repository.findAllPromptTemplates();
  }

  async createPromptTemplate(data: any) {
    if (data.isActive) {
      await this.repository.deactivateOtherTemplates(data.sectionId);
    }
    return this.repository.createPromptTemplate(data);
  }

  async updatePromptTemplate(id: string, data: any) {
    if (data.isActive) {
      const template = await this.repository.findPromptTemplateById(id);
      if (template) {
        await this.repository.deactivateOtherTemplates(template.sectionId);
      }
    }
    return this.repository.updatePromptTemplate(id, data);
  }

  // QuotaConfig CRUD
  async getQuotaConfigs() {
    return this.repository.findAllQuotaConfigs();
  }

  async updateQuotaConfig(id: string, data: UpdateQuotaConfigDto) {
    const updated = await this.repository.updateQuotaConfig(id, data);
    await this.tokenService.invalidateQuotaCache(updated.tier);
    return updated;
  }

  // CreditConfig CRUD (v1.5 §10a)
  async getCreditConfigs() {
    return this.repository.findAllCreditConfigs();
  }

  async updateCreditConfig(id: string, dto: UpdateCreditConfigDto) {
    return this.repository.updateCreditConfig(id, dto);
  }

  // Broadcast notification (v1.5 §10b)
  async broadcastNotification(dto: BroadcastNotificationDto) {
    return this.notificationService.broadcast(dto.type, dto.message);
  }

  // ModelPricing CRUD
  async getModelPricings() {
    return this.repository.findAllModelPricings();
  }

  async createModelPricing(dto: CreateModelPricingDto) {
    return this.repository.createModelPricing(dto);
  }

  async updateModelPricing(id: string, dto: UpdateModelPricingDto) {
    const existing = await this.repository.findModelPricingById(id);
    if (!existing) {
      throw new NotFoundException('Model pricing not found');
    }
    return this.repository.updateModelPricing(id, dto);
  }

  async deleteModelPricing(id: string) {
    const existing = await this.repository.findModelPricingById(id);
    if (!existing) {
      throw new NotFoundException('Model pricing not found');
    }
    return this.repository.deleteModelPricing(id);
  }

  async getTokenDashboard(query: TokenDashboardQueryDto) {
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;

    if (to) {
      to.setHours(23, 59, 59, 999);
    }

    const rows = await this.repository.findTokenUsageForDashboard({
      from,
      to,
      tier: query.tier,
      provider: query.provider,
      email: query.email,
    });

    const userMap = new Map<
      string,
      {
        userId: string;
        email: string;
        tier: string;
        trialEndsAt: Date | null;
        totalInputTokens: number;
        totalOutputTokens: number;
        totalEstimatedCostUsd: number;
        byProvider: Record<
          string,
          { inputTokens: number; outputTokens: number; estimatedCostUsd: number }
        >;
      }
    >();

    for (const row of rows) {
      const userId = row.userId;
      if (!userMap.has(userId)) {
        userMap.set(userId, {
          userId,
          email: row.user.email,
          tier: row.user.subscription?.tier ?? 'FREE',
          trialEndsAt: row.user.trialEndsAt,
          totalInputTokens: 0,
          totalOutputTokens: 0,
          totalEstimatedCostUsd: 0,
          byProvider: {},
        });
      }

      const entry = userMap.get(userId)!;
      entry.totalInputTokens += row.inputTokens;
      entry.totalOutputTokens += row.outputTokens;
      entry.totalEstimatedCostUsd += row.estimatedCostUsd;

      if (!entry.byProvider[row.provider]) {
        entry.byProvider[row.provider] = {
          inputTokens: 0,
          outputTokens: 0,
          estimatedCostUsd: 0,
        };
      }

      const providerEntry = entry.byProvider[row.provider];
      providerEntry.inputTokens += row.inputTokens;
      providerEntry.outputTokens += row.outputTokens;
      providerEntry.estimatedCostUsd += row.estimatedCostUsd;
    }

    const users = Array.from(userMap.values()).map((user) => ({
      ...user,
      totalEstimatedCostUsd: parseFloat(user.totalEstimatedCostUsd.toFixed(6)),
      byProvider: Object.entries(user.byProvider).map(([provider, stats]) => ({
        provider,
        ...stats,
        estimatedCostUsd: parseFloat(stats.estimatedCostUsd.toFixed(6)),
      })),
    }));

    users.sort((a, b) => b.totalEstimatedCostUsd - a.totalEstimatedCostUsd);

    const totals = users.reduce(
      (acc, user) => {
        acc.totalInputTokens += user.totalInputTokens;
        acc.totalOutputTokens += user.totalOutputTokens;
        acc.totalEstimatedCostUsd += user.totalEstimatedCostUsd;
        return acc;
      },
      { totalInputTokens: 0, totalOutputTokens: 0, totalEstimatedCostUsd: 0 },
    );

    return {
      filters: query,
      summary: {
        userCount: users.length,
        ...totals,
        totalEstimatedCostUsd: parseFloat(totals.totalEstimatedCostUsd.toFixed(6)),
      },
      users,
    };
  }

  async getUsers(pagination: PaginationDto = { page: 1, limit: 20 }) {
    const page = pagination.page || 1;
    const limit = pagination.limit || 20;
    const skip = (page - 1) * limit;

    const { data, total } = await this.repository.findUsersOverview(skip, limit);
    const now = new Date();

    return {
      data: data.map((user) => ({
        ...user,
        isTrialActive: !!(user.trialEndsAt && user.trialEndsAt > now),
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 0,
      },
    };
  }

  async getDashboardStats() {
    const raw = await this.repository.findDashboardStats();
    const monthLabels: string[] = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthLabels.push(
        d.toLocaleString('en-US', { month: 'short', year: '2-digit' }),
      );
    }

    const growthMap = new Map<string, number>();
    const costMap = new Map<string, number>();
    monthLabels.forEach((m) => {
      growthMap.set(m, 0);
      costMap.set(m, 0);
    });

    for (const u of raw.usersForGrowth) {
      const key = new Date(u.createdAt).toLocaleString('en-US', {
        month: 'short',
        year: '2-digit',
      });
      if (growthMap.has(key)) {
        growthMap.set(key, (growthMap.get(key) || 0) + 1);
      }
    }

    // cumulative signups over the window
    let running = 0;
    const userGrowth = monthLabels.map((month) => {
      running += growthMap.get(month) || 0;
      return { month, users: running };
    });

    for (const row of raw.tokenByMonthRaw) {
      const key = new Date(row.date).toLocaleString('en-US', {
        month: 'short',
        year: '2-digit',
      });
      if (costMap.has(key)) {
        costMap.set(key, (costMap.get(key) || 0) + row.estimatedCostUsd);
      }
    }

    const aiCostByMonth = monthLabels.map((month) => ({
      month,
      cost: parseFloat((costMap.get(month) || 0).toFixed(4)),
    }));

    const tierCounts: Record<string, number> = {
      FREE: raw.freeSubscribed + raw.usersWithoutSub,
    };
    for (const g of raw.tierGroups) {
      if (g.tier === 'FREE') {
        tierCounts.FREE = g._count.tier + raw.usersWithoutSub;
      } else {
        tierCounts[g.tier] = g._count.tier;
      }
    }

    return {
      totals: {
        totalUsers: raw.totalUsers,
        trialUsers: raw.trialUsers,
        paidUsers: raw.paidUsers,
        freeUsers: tierCounts.FREE || 0,
        aiCostTodayUsd: parseFloat(
          (raw.tokenCostToday._sum.estimatedCostUsd || 0).toFixed(6),
        ),
        aiCostMonthUsd: parseFloat(
          (raw.tokenCostMonth._sum.estimatedCostUsd || 0).toFixed(6),
        ),
        aiCostAllTimeUsd: parseFloat(
          (raw.tokenCostAll._sum.estimatedCostUsd || 0).toFixed(6),
        ),
        totalInputTokens: raw.tokenCostAll._sum.inputTokens || 0,
        totalOutputTokens: raw.tokenCostAll._sum.outputTokens || 0,
      },
      userGrowth,
      aiCostByMonth,
      tierCounts,
      recentUsers: raw.recentUsers.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        tier: u.subscription?.tier || 'FREE',
        createdAt: u.createdAt,
      })),
    };
  }

  listSitePages() {
    return this.sitePageService.list();
  }

  updateSitePage(slug: string, dto: UpdateSitePageDto) {
    return this.sitePageService.update(slug, dto);
  }

  // ─────────────────────────────────────────────
  // Stripe price → tier map
  // ─────────────────────────────────────────────

  listStripePrices() {
    return this.repository.findAllStripePrices();
  }

  async createStripePrice(dto: CreateStripePriceDto) {
    const existing = await this.repository.findStripePriceByPriceId(dto.priceId);
    if (existing) {
      throw new ConflictException(`Price "${dto.priceId}" is already mapped`);
    }
    return this.repository.createStripePrice(dto);
  }

  async updateStripePrice(id: string, dto: UpdateStripePriceDto) {
    await this.findStripePriceOrFail(id);
    return this.repository.updateStripePrice(id, dto);
  }

  async deleteStripePrice(id: string) {
    await this.findStripePriceOrFail(id);
    await this.repository.deleteStripePrice(id);
    return { message: 'Stripe price mapping removed' };
  }

  private async findStripePriceOrFail(id: string) {
    const price = await this.repository.findStripePriceById(id);
    if (!price) {
      throw new NotFoundException('Stripe price mapping not found');
    }
    return price;
  }

  // ─────────────────────────────────────────────
  // Payments (Stripe + RevenueCat)
  // ─────────────────────────────────────────────

  async listPayments(pagination: PaginationDto) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;
    const skip = (page - 1) * limit;

    const [items, total] = await this.repository.findPayments(skip, limit);

    return {
      data: items,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }
}

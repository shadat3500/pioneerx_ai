import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AdminRepository } from './admin.repository';
import { AdminLoginDto } from './dto/admin-login.dto';
import { CreateModelPricingDto, UpdateModelPricingDto } from './dto/model-pricing.dto';
import { UpdateQuotaConfigDto } from './dto/quota-config.dto';
import { TokenDashboardQueryDto } from './dto/token-dashboard-query.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { AiProviderService } from '../ai-provider/ai-provider.service';
import { TokenService } from '../token/token.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly repository: AdminRepository,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly aiProvider: AiProviderService,
    private readonly tokenService: TokenService,
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
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}

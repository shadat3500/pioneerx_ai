import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BaseRepository } from '../../common/repositories/base.repository';
import { AdminUser } from '@prisma/client';

@Injectable()
export class AdminRepository extends BaseRepository<AdminUser> {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma, 'adminUser');
  }

  async findByEmail(email: string) {
    return this.prisma.adminUser.findUnique({
      where: { email },
    });
  }

  // Section CRUD
  async findAllSections() {
    return this.prisma.section.findMany({
      include: { promptTemplates: true, suggestedLinks: true },
    });
  }

  async updateSection(id: string, data: any) {
    return this.prisma.section.update({
      where: { id },
      data,
    });
  }

  // AiModelConfig CRUD
  async findAllAiModelConfigs() {
    return this.prisma.aiModelConfig.findMany();
  }

  async updateAiModelConfig(id: string, data: any) {
    return this.prisma.aiModelConfig.update({
      where: { id },
      data,
    });
  }

  // PromptTemplate CRUD
  async findAllPromptTemplates() {
    return this.prisma.promptTemplate.findMany();
  }

  async findPromptTemplateById(id: string) {
    return this.prisma.promptTemplate.findUnique({ where: { id } });
  }

  async deactivateOtherTemplates(sectionId: string) {
    return this.prisma.promptTemplate.updateMany({
      where: { sectionId },
      data: { isActive: false },
    });
  }

  async createPromptTemplate(data: any) {
    return this.prisma.promptTemplate.create({ data });
  }

  async updatePromptTemplate(id: string, data: any) {
    return this.prisma.promptTemplate.update({
      where: { id },
      data,
    });
  }

  // QuotaConfig CRUD
  async findAllQuotaConfigs() {
    return this.prisma.quotaConfig.findMany();
  }

  async updateQuotaConfig(id: string, data: any) {
    return this.prisma.quotaConfig.update({
      where: { id },
      data,
    });
  }

  // CreditConfig CRUD (v1.5)
  async findAllCreditConfigs() {
    return this.prisma.creditConfig.findMany({
      orderBy: { tier: 'asc' },
    });
  }

  async updateCreditConfig(id: string, data: any) {
    return this.prisma.creditConfig.update({
      where: { id },
      data,
    });
  }

  // ModelPricing CRUD
  async findAllModelPricings() {
    return this.prisma.modelPricing.findMany({
      orderBy: [{ provider: 'asc' }, { modelId: 'asc' }],
    });
  }

  async createModelPricing(data: {
    provider: string;
    modelId: string;
    inputPricePerMToken: number;
    outputPricePerMToken: number;
  }) {
    return this.prisma.modelPricing.create({ data });
  }

  async updateModelPricing(
    id: string,
    data: { inputPricePerMToken?: number; outputPricePerMToken?: number },
  ) {
    return this.prisma.modelPricing.update({
      where: { id },
      data,
    });
  }

  async deleteModelPricing(id: string) {
    return this.prisma.modelPricing.delete({
      where: { id },
    });
  }

  async findModelPricingById(id: string) {
    return this.prisma.modelPricing.findUnique({ where: { id } });
  }

  // Token dashboard aggregation
  async findTokenUsageForDashboard(filters: {
    from?: Date;
    to?: Date;
    tier?: string;
    provider?: string;
    email?: string;
  }) {
    return this.prisma.tokenUsage.findMany({
      where: {
        date: {
          ...(filters.from ? { gte: filters.from } : {}),
          ...(filters.to ? { lte: filters.to } : {}),
        },
        ...(filters.provider ? { provider: filters.provider } : {}),
        user: {
          ...(filters.email
            ? { email: { contains: filters.email, mode: 'insensitive' as const } }
            : {}),
          ...(filters.tier
            ? { subscription: { tier: filters.tier as any } }
            : {}),
        },
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            trialEndsAt: true,
            subscription: { select: { tier: true } },
          },
        },
      },
    });
  }

  // Admin user overview
  async findUsersOverview(skip: number, take: number) {
    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          name: true,
          isEmailVerified: true,
          trialEndsAt: true,
          createdAt: true,
          subscription: {
            select: {
              tier: true,
              status: true,
              renewsAt: true,
            },
          },
        },
      }),
      this.prisma.user.count(),
    ]);

    return { data, total };
  }
}

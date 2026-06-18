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
      include: { promptTemplates: true, toolCatalog: true, suggestedLinks: true },
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

  // ToolCatalogItem CRUD
  async findAllToolCatalogItems() {
    return this.prisma.toolCatalogItem.findMany();
  }

  async createToolCatalogItem(data: any) {
    return this.prisma.toolCatalogItem.create({ data });
  }

  async updateToolCatalogItem(id: string, data: any) {
    return this.prisma.toolCatalogItem.update({
      where: { id },
      data,
    });
  }

  async deleteToolCatalogItem(id: string) {
    return this.prisma.toolCatalogItem.delete({
      where: { id },
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

  // AiTip CRUD
  async findAllAiTips() {
    return this.prisma.aiTip.findMany();
  }

  async createAiTip(data: any) {
    return this.prisma.aiTip.create({ data });
  }

  async updateAiTip(id: string, data: any) {
    return this.prisma.aiTip.update({
      where: { id },
      data,
    });
  }

  async deleteAiTip(id: string) {
    return this.prisma.aiTip.delete({
      where: { id },
    });
  }
}

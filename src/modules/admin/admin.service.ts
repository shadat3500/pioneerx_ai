import { ForbiddenException, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AdminRepository } from './admin.repository';
import { AdminLoginDto } from './dto/admin-login.dto';

@Injectable()
export class AdminService {
  constructor(
    private readonly repository: AdminRepository,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

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
      expiresIn: (this.config.get<string>('JWT_AT_EXPIRES_IN') || '15m') as any,
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
    return this.repository.updateAiModelConfig(id, data);
  }

  // ToolCatalogItem CRUD
  async getToolCatalogItems() {
    return this.repository.findAllToolCatalogItems();
  }

  async createToolCatalogItem(data: any) {
    return this.repository.createToolCatalogItem(data);
  }

  async updateToolCatalogItem(id: string, data: any) {
    return this.repository.updateToolCatalogItem(id, data);
  }

  async deleteToolCatalogItem(id: string) {
    return this.repository.deleteToolCatalogItem(id);
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

  async updateQuotaConfig(id: string, data: any) {
    return this.repository.updateQuotaConfig(id, data);
  }

  // AiTip CRUD
  async getAiTips() {
    return this.repository.findAllAiTips();
  }

  async createAiTip(data: any) {
    return this.repository.createAiTip(data);
  }

  async updateAiTip(id: string, data: any) {
    return this.repository.updateAiTip(id, data);
  }

  async deleteAiTip(id: string) {
    return this.repository.deleteAiTip(id);
  }
}

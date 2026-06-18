import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BaseRepository } from '../../common/repositories/base.repository';
import { Integration, IntegrationProvider } from '@prisma/client';

@Injectable()
export class IntegrationRepository extends BaseRepository<Integration> {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma, 'integration');
  }

  async findByUserIdAndProvider(userId: string, provider: IntegrationProvider) {
    return this.prisma.integration.findFirst({
      where: {
        userId,
        provider,
        status: 'connected',
      },
    });
  }

  async upsertMockIntegration(id: string, userId: string, provider: IntegrationProvider, accessToken: string, shop: string) {
    return this.prisma.integration.upsert({
      where: { id },
      update: {
        accessToken,
        status: 'connected',
        refreshToken: shop,
      },
      create: {
        userId,
        provider,
        accessToken,
        refreshToken: shop,
        status: 'connected',
      },
    });
  }

  async createIntegration(data: {
    userId: string;
    provider: IntegrationProvider;
    accessToken: string;
    refreshToken: string;
    status: string;
  }) {
    return this.prisma.integration.create({
      data,
    });
  }

  async findFirstByUserAndProvider(userId: string, provider: IntegrationProvider) {
    return this.prisma.integration.findFirst({
      where: { userId, provider },
    });
  }

  async deleteIntegration(id: string) {
    return this.prisma.integration.delete({
      where: { id },
    });
  }
}

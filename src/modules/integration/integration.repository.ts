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

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BaseRepository } from '../../common/repositories/base.repository';
import { BusinessProfile } from '@prisma/client';

@Injectable()
export class BusinessProfileRepository extends BaseRepository<BusinessProfile> {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma, 'businessProfile');
  }

  async findByUserId(userId: string) {
    return this.prisma.businessProfile.findUnique({
      where: { userId },
    });
  }

  async upsertProfile(userId: string, data: any) {
    return this.prisma.businessProfile.upsert({
      where: { userId },
      update: data,
      create: {
        userId,
        ...data,
      },
    });
  }
}

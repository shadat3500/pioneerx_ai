import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BaseRepository } from '../../common/repositories/base.repository';

@Injectable()
export class UsersRepository extends BaseRepository<User> {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma, 'user');
  }

  // Custom methods specific to Users can be added here
  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }
}

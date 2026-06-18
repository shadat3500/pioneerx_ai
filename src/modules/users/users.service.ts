import { Injectable, NotFoundException } from '@nestjs/common';
import { UsersRepository } from './users.repository';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepo: UsersRepository) {}

  async findAll(query: any) {
    return this.usersRepo.paginate(query);
  }

  async findOne(id: string) {
    const user = await this.usersRepo.findById(id);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findOne(id);
    return this.usersRepo.update(id, dto);
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.usersRepo.delete(id);
  }

  async findByEmail(email: string) {
    return this.usersRepo.findByEmail(email);
  }
}

import { PrismaService } from '../../prisma/prisma.service';
import { PaginatedResult, PaginationDto } from '../dto/pagination.dto';

export abstract class BaseRepository<T> {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly model: string,
  ) {}

  async create(data: any): Promise<T> {
    return (this.prisma as any)[this.model].create({ data });
  }

  async findAll(params?: {
    skip?: number;
    take?: number;
    cursor?: any;
    where?: any;
    orderBy?: any;
  }): Promise<T[]> {
    return (this.prisma as any)[this.model].findMany(params);
  }

  async findById(id: any): Promise<T | null> {
    const primaryKey = 'id'; // Defaulting to 'id', can be overridden if needed
    return (this.prisma as any)[this.model].findUnique({
      where: { [primaryKey]: id },
    });
  }

  async update(id: any, data: any): Promise<T> {
    return (this.prisma as any)[this.model].update({
      where: { id },
      data,
    });
  }

  async delete(id: any): Promise<T> {
    return (this.prisma as any)[this.model].delete({
      where: { id },
    });
  }

  async paginate(
    query: any = {},
    pagination: PaginationDto = { page: 1, limit: 10 },
  ): Promise<PaginatedResult<T>> {
    const page = pagination.page || 1;
    const limit = pagination.limit || 10;
    const { sortBy, sortOrder } = pagination;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      (this.prisma as any)[this.model].findMany({
        ...query,
        skip,
        take: Number(limit),
        orderBy: sortBy ? { [sortBy]: sortOrder || 'desc' } : { createdAt: 'desc' },
      }),
      (this.prisma as any)[this.model].count({ where: query.where }),
    ]);

    return {
      data,
      meta: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}

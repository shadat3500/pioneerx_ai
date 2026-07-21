import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminCreateReviewDto, SubmitReviewDto } from './dto/submit-review.dto';

@Injectable()
export class ReviewService {
  constructor(private readonly prisma: PrismaService) {}

  /** Public — approved reviews only */
  async findApproved() {
    return this.prisma.review.findMany({
      where: { isApproved: true },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        roleCompany: true,
        reviewText: true,
        rating: true,
        avatarUrl: true,
        createdAt: true,
      },
    });
  }

  /**
   * Authenticated user submission — live immediately (auto-approved).
   * Admin can hide it later via reject. One review per user:
   * resubmitting updates the existing review.
   */
  async submit(userId: string, dto: SubmitReviewDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });
    if (!user) throw new NotFoundException('User not found');

    // Name always comes from the user record, never from the client
    const name = user.name?.trim() || user.email.split('@')[0];

    const existing = await this.prisma.review.findUnique({
      where: { userId },
    });

    const data = {
      name,
      roleCompany: dto.roleCompany?.trim() || null,
      reviewText: dto.reviewText.trim(),
      rating: dto.rating ?? null,
      isApproved: true,
    };

    if (existing) {
      await this.prisma.review.update({ where: { userId }, data });
      return { message: 'Review updated. Thank you!' };
    }

    await this.prisma.review.create({ data: { userId, ...data } });
    return { message: 'Review submitted. Thank you!' };
  }

  // ── Admin ──────────────────────────────────

  async findAll() {
    return this.prisma.review.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, email: true, name: true } },
      },
    });
  }

  async findPending() {
    return this.prisma.review.findMany({
      where: { isApproved: false },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, email: true, name: true } },
      },
    });
  }

  async createAsAdmin(dto: AdminCreateReviewDto) {
    return this.prisma.review.create({
      data: {
        name: dto.name.trim(),
        roleCompany: dto.roleCompany?.trim() || null,
        reviewText: dto.reviewText.trim(),
        rating: dto.rating ?? null,
        avatarUrl: dto.avatarUrl || null,
        isApproved: true,
      },
    });
  }

  async approve(id: string) {
    const review = await this.prisma.review.findUnique({ where: { id } });
    if (!review) throw new NotFoundException('Review not found');

    return this.prisma.review.update({
      where: { id },
      data: { isApproved: true },
    });
  }

  /** Hide a review from the public site without deleting it */
  async reject(id: string) {
    const review = await this.prisma.review.findUnique({ where: { id } });
    if (!review) throw new NotFoundException('Review not found');

    return this.prisma.review.update({
      where: { id },
      data: { isApproved: false },
    });
  }

  async remove(id: string) {
    const review = await this.prisma.review.findUnique({ where: { id } });
    if (!review) throw new NotFoundException('Review not found');

    await this.prisma.review.delete({ where: { id } });
    return { message: 'Review deleted' };
  }
}

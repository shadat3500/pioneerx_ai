import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePromoCodeDto, UpdatePromoCodeDto } from './dto/promo.dto';

@Injectable()
export class PromoService {
  private readonly logger = new Logger(PromoService.name);

  constructor(private readonly prisma: PrismaService) {}

  private normalizeCode(code: string) {
    return code.trim().toUpperCase();
  }

  // ─────────────────────────────────────────────
  // 12b. Apply promo code (user)
  // ─────────────────────────────────────────────

  async applyPromoCode(userId: string, code: string) {
    const normalized = this.normalizeCode(code);
    const promo = await this.prisma.promoCode.findFirst({
      where: {
        isActive: true,
        code: { equals: normalized, mode: 'insensitive' },
      },
    });

    if (!promo) {
      throw new NotFoundException('Invalid promo code');
    }
    if (promo.expiresAt && promo.expiresAt < new Date()) {
      throw new BadRequestException('Promo code expired');
    }
    if (promo.maxUses !== null && promo.usedCount >= promo.maxUses) {
      throw new BadRequestException('Promo code limit reached');
    }

    const existingRedemption = await this.prisma.promoCodeRedemption.findUnique({
      where: {
        promoCodeId_userId: {
          promoCodeId: promo.id,
          userId,
        },
      },
    });
    if (existingRedemption) {
      throw new BadRequestException('Already redeemed');
    }

    const trialEndsAt = new Date(Date.now() + promo.trialDays * 24 * 60 * 60 * 1000);

    await this.prisma.$transaction(async (db) => {
      await db.user.update({
        where: { id: userId },
        data: { trialEndsAt },
      });

      await db.promoCode.update({
        where: { id: promo.id },
        data: { usedCount: { increment: 1 } },
      });

      await db.promoCodeRedemption.create({
        data: {
          promoCodeId: promo.id,
          userId,
        },
      });
    });

    return { trialEndsAt };
  }

  /** 12c. Best-effort promo application during registration — never fails the signup. */
  async tryApplyAtRegistration(userId: string, code: string) {
    try {
      return await this.applyPromoCode(userId, code);
    } catch (err) {
      this.logger.warn(
        `Promo code "${code}" not applied at registration for ${userId}: ${(err as Error).message}`,
      );
      return null;
    }
  }

  // ─────────────────────────────────────────────
  // Public — active codes for website listing
  // ─────────────────────────────────────────────

  async listActivePublicPromoCodes() {
    const now = new Date();
    const rows = await this.prisma.promoCode.findMany({
      where: {
        isActive: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { createdAt: 'desc' },
      select: {
        code: true,
        trialDays: true,
        expiresAt: true,
        maxUses: true,
        usedCount: true,
      },
    });

    return rows
      .filter((row) => row.maxUses === null || row.usedCount < row.maxUses)
      .map(({ code, trialDays, expiresAt }) => ({
        code,
        trialDays,
        expiresAt,
      }));
  }

  // ─────────────────────────────────────────────
  // 12d. Admin promo code management
  // ─────────────────────────────────────────────

  async listPromoCodes() {
    return this.prisma.promoCode.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async createPromoCode(dto: CreatePromoCodeDto) {
    return this.prisma.promoCode.create({
      data: {
        code: this.normalizeCode(dto.code),
        trialDays: dto.trialDays,
        maxUses: dto.maxUses ?? null,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
    });
  }

  async updatePromoCode(id: string, dto: UpdatePromoCodeDto) {
    const existing = await this.prisma.promoCode.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Promo code not found');
    }

    return this.prisma.promoCode.update({
      where: { id },
      data: {
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.trialDays !== undefined && { trialDays: dto.trialDays }),
        ...(dto.maxUses !== undefined && { maxUses: dto.maxUses }),
        ...(dto.expiresAt !== undefined && { expiresAt: new Date(dto.expiresAt) }),
      },
    });
  }

  async deletePromoCode(id: string) {
    const existing = await this.prisma.promoCode.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Promo code not found');
    }

    await this.prisma.promoCode.delete({ where: { id } });
    return { deleted: true, id };
  }
}

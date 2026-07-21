import {
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModelRole, SubscriptionTier } from '@prisma/client';
import { OpenAI } from 'openai';
import { PrismaService } from '../../prisma/prisma.service';
import { CreditService } from '../credit/credit.service';
import { BusinessProfileService } from '../business-profile/business-profile.service';
import { CREDIT_COST_IMAGE_GENERATION } from '../credit/credit.constants';
import { GenerateImageDto } from './dto/generate-image.dto';

@Injectable()
export class ImageService {
  private readonly logger = new Logger(ImageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly creditService: CreditService,
    private readonly businessProfileService: BusinessProfileService,
  ) {}

  async generate(userId: string, dto: GenerateImageDto) {
    // 1. Daily image limit
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { subscription: true },
    });
    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    const tier = user.subscription?.tier ?? SubscriptionTier.FREE;
    const quota = await this.prisma.quotaConfig.findUnique({ where: { tier } });
    const dailyImageLimit = quota?.dailyImageLimit ?? null;

    if (dailyImageLimit !== null) {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const todayCount = await this.prisma.imageGeneration.count({
        where: { userId, createdAt: { gte: startOfDay } },
      });

      if (todayCount >= dailyImageLimit) {
        throw new HttpException(
          {
            dailyLimitReached: true,
            message: "You've reached your daily image limit. Upgrade for more.",
          },
          HttpStatus.FORBIDDEN,
        );
      }
    }

    // 2. Credit balance
    const creditCheck = await this.creditService.checkBalance(
      userId,
      CREDIT_COST_IMAGE_GENERATION,
    );
    if (!creditCheck.allowed) {
      throw new HttpException(
        {
          creditLimitReached: true,
          balance: creditCheck.balance,
          message: 'Not enough credits for image generation.',
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    // 3. Reserve credits
    const reservation = await this.creditService.reserve(
      userId,
      CREDIT_COST_IMAGE_GENERATION,
      'image generation',
    );

    try {
      // 4. Call DALL-E
      const profile = await this.businessProfileService.resolveActiveProfile(userId);
      const imageUrl = await this.callImageModel(dto);

      // 5. Confirm + persist
      await this.creditService.confirm(reservation.reservationId);

      await this.prisma.imageGeneration.create({
        data: {
          userId,
          businessProfileId: profile.id,
          prompt: dto.prompt,
          imageUrl,
          creditsDeducted: CREDIT_COST_IMAGE_GENERATION,
        },
      });

      // Track daily count on the date-scoped DailyTask record if one exists
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(startOfDay);
      endOfDay.setDate(endOfDay.getDate() + 1);
      await this.prisma.dailyTask.updateMany({
        where: {
          businessProfileId: profile.id,
          date: { gte: startOfDay, lt: endOfDay },
        },
        data: { imageGenerationCount: { increment: 1 } },
      });

      await this.creditService.checkAndNotifyLow(userId);

      // 7. Include creditStatus
      const creditStatus = await this.creditService.getStatus(userId);

      return { imageUrl, creditStatus };
    } catch (err) {
      // 6. Refund on failure
      await this.creditService.refund(reservation.reservationId);

      if (err instanceof HttpException) throw err;

      this.logger.error(`Image generation failed for ${userId}: ${(err as Error).message}`);
      throw new InternalServerErrorException('Image generation failed. Credits refunded.');
    }
  }

  private async callImageModel(dto: GenerateImageDto): Promise<string> {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new InternalServerErrorException('OpenAI API key is not configured (OPENAI_API_KEY)');
    }

    let modelId = 'dall-e-3';
    try {
      const config = await this.prisma.aiModelConfig.findUnique({
        where: { role: ModelRole.IMAGE_GENERATOR },
      });
      if (config?.isActive && config.modelId) {
        modelId = config.modelId;
      }
    } catch {
      /* fall back to dall-e-3 */
    }

    const typeContext =
      dto.type === 'logo'
        ? 'Design a professional brand logo. Clean, memorable, suitable for business use.'
        : 'Design a professional business card layout. Clean typography, print-ready look.';

    const openai = new OpenAI({ apiKey });
    const response = await openai.images.generate({
      model: modelId,
      prompt: `${typeContext}\n\n${dto.prompt}`,
      n: 1,
      size: '1024x1024',
    });

    const imageUrl = response.data?.[0]?.url;
    if (!imageUrl) {
      throw new InternalServerErrorException('Image model returned no image');
    }
    return imageUrl;
  }
}

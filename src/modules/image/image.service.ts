import {
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModelRole } from '@prisma/client';
import { OpenAI } from 'openai';
import { PrismaService } from '../../prisma/prisma.service';
import { CreditService } from '../credit/credit.service';
import { BusinessProfileService } from '../business-profile/business-profile.service';
import { ConversationService } from '../conversation/conversation.service';
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
    private readonly conversationService: ConversationService,
  ) {}

  async generate(userId: string, dto: GenerateImageDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { subscription: true },
    });
    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    const tier = user.subscription?.tier ?? 'FREE';
    const creditConfig = await this.prisma.creditConfig.findUnique({
      where: { tier: tier as any },
    });
    const dailyImageLimit = creditConfig?.dailyImageLimit ?? null;

    // Daily image cap (from CreditConfig) — empty/null = unlimited
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
            limit: dailyImageLimit,
            used: todayCount,
            message: `You've reached your daily image limit (${dailyImageLimit}). Upgrade or try again tomorrow.`,
          },
          HttpStatus.FORBIDDEN,
        );
      }
    }

    // Credit balance (40 credits per image)
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

    // Reserve credits
    const reservation = await this.creditService.reserve(
      userId,
      CREDIT_COST_IMAGE_GENERATION,
      'image generation',
    );

    try {
      // 4. Call image model
      const profile = await this.businessProfileService.resolveActiveProfile(userId);
      const imageUrl = await this.callImageModel(dto);

      // 5. Confirm + persist ImageGeneration
      await this.creditService.confirm(reservation.reservationId);

      const imageRecord = await this.prisma.imageGeneration.create({
        data: {
          userId,
          businessProfileId: profile.id,
          prompt: dto.prompt,
          imageUrl,
          creditsDeducted: CREDIT_COST_IMAGE_GENERATION,
        },
      });

      // Short ref for chat history (full base64 is too large for messages / conversation payloads)
      const imageRef = `image-generation:${imageRecord.id}`;

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

      const creditStatus = await this.creditService.getStatus(userId);

      // 6. Optional: also drop into the section chat
      type ChatMessageRow = {
        id: string;
        conversationId: string;
        role: string;
        content: string;
        imageUrl: string | null;
        createdAt: Date;
      };
      let userMessage: ChatMessageRow | null = null;
      let assistantMessage: ChatMessageRow | null = null;

      if (dto.sectionKey) {
        const conversation = await this.conversationService.getOrCreate(
          userId,
          dto.sectionKey,
        );
        const typeLabel = dto.type === 'logo' ? 'logo' : 'business card';

        userMessage = await this.prisma.message.create({
          data: {
            conversationId: conversation.id,
            role: 'user',
            content: `Generate a ${typeLabel}: ${dto.prompt}`,
          },
        });

        assistantMessage = await this.prisma.message.create({
          data: {
            conversationId: conversation.id,
            role: 'assistant',
            content: `Here's your ${typeLabel}.`,
            imageUrl: imageRef,
          },
        });
      }

      return {
        imageUrl,
        imageGenerationId: imageRecord.id,
        creditStatus,
        ...(userMessage && assistantMessage
          ? {
              userMessage,
              assistantMessage: { ...assistantMessage, imageUrl },
            }
          : {}),
      };
    } catch (err) {
      // Refund on failure
      await this.creditService.refund(reservation.reservationId);

      if (err instanceof HttpException) throw err;

      this.logger.error(`Image generation failed for ${userId}: ${(err as Error).message}`);
      throw new InternalServerErrorException('Image generation failed. Credits refunded.');
    }
  }

  /** Resolve a stored chat image ref / ImageGeneration row for the owning user. */
  async getGenerationForUser(userId: string, generationId: string) {
    const row = await this.prisma.imageGeneration.findFirst({
      where: { id: generationId, userId },
    });
    if (!row) {
      throw new HttpException('Image not found', HttpStatus.NOT_FOUND);
    }
    return { id: row.id, imageUrl: row.imageUrl, prompt: row.prompt, createdAt: row.createdAt };
  }

  private async callImageModel(dto: GenerateImageDto): Promise<string> {
    const typeContext =
      dto.type === 'logo'
        ? 'Design a professional brand logo. Clean, memorable, suitable for business use.'
        : 'Design a professional business card layout. Clean typography, print-ready look.';
    const prompt = `${typeContext}\n\n${dto.prompt}`;

    // ── Active: OpenAI gpt-image-2 ──
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new InternalServerErrorException(
        'OpenAI API key is not configured (OPENAI_API_KEY)',
      );
    }

    let modelId = 'gpt-image-2';
    try {
      const config = await this.prisma.aiModelConfig.findUnique({
        where: { role: ModelRole.IMAGE_GENERATOR },
      });
      if (config?.isActive && config.modelId) {
        modelId = config.modelId;
      }
    } catch {
      /* fall back to gpt-image-2 */
    }

    const openai = new OpenAI({ apiKey });
    const response = await openai.images.generate({
      model: modelId,
      prompt,
      n: 1,
      size: '1024x1024',
    });

    const url = response.data?.[0]?.url;
    if (!url) {
      throw new InternalServerErrorException('Image model returned no image');
    }
    return url;

    // ── Previous: Gemini image generation (kept for easy rollback) ──
    // const apiKey = this.config.get<string>('GOOGLE_AI_API_KEY');
    // if (!apiKey) {
    //   throw new InternalServerErrorException(
    //     'Google AI API key is not configured (GOOGLE_AI_API_KEY)',
    //   );
    // }
    //
    // let modelId = 'gemini-2.5-flash-image';
    // try {
    //   const config = await this.prisma.aiModelConfig.findUnique({
    //     where: { role: ModelRole.IMAGE_GENERATOR },
    //   });
    //   if (config?.isActive && config.provider === 'google' && config.modelId) {
    //     modelId = config.modelId;
    //   }
    // } catch {
    //   /* fall back to gemini-2.5-flash-image */
    // }
    //
    // const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;
    // const geminiRes = await fetch(endpoint, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({
    //     contents: [{ parts: [{ text: prompt }] }],
    //     generationConfig: {
    //       responseModalities: ['TEXT', 'IMAGE'],
    //     },
    //   }),
    // });
    //
    // if (!geminiRes.ok) {
    //   const errBody = await geminiRes.text();
    //   this.logger.error(`Gemini image API ${geminiRes.status}: ${errBody}`);
    //   throw new InternalServerErrorException(
    //     `Gemini image generation failed (${geminiRes.status})`,
    //   );
    // }
    //
    // const geminiJson = (await geminiRes.json()) as {
    //   candidates?: Array<{
    //     content?: {
    //       parts?: Array<{
    //         inlineData?: { mimeType?: string; data?: string };
    //         text?: string;
    //       }>;
    //     };
    //   }>;
    // };
    //
    // const parts = geminiJson.candidates?.[0]?.content?.parts ?? [];
    // const imagePart = parts.find((p) => p.inlineData?.data);
    // const mimeType = imagePart?.inlineData?.mimeType ?? 'image/png';
    // const base64 = imagePart?.inlineData?.data;
    // if (!base64) {
    //   throw new InternalServerErrorException('Gemini returned no image data');
    // }
    // return `data:${mimeType};base64,${base64}`;

    // ── Previous: Grok Imagine / xAI (kept for easy rollback) ──
    // const apiKey = this.config.get<string>('XAI_API_KEY');
    // if (!apiKey) {
    //   throw new InternalServerErrorException('xAI API key is not configured (XAI_API_KEY)');
    // }
    //
    // let modelId = 'grok-imagine-image-quality';
    // try {
    //   const config = await this.prisma.aiModelConfig.findUnique({
    //     where: { role: ModelRole.IMAGE_GENERATOR },
    //   });
    //   if (config?.isActive && config.provider === 'xai' && config.modelId) {
    //     modelId = config.modelId;
    //   }
    // } catch {
    //   /* fall back to grok-imagine-image-quality */
    // }
    //
    // const xai = new OpenAI({
    //   apiKey,
    //   baseURL: 'https://api.x.ai/v1',
    // });
    // const response = await xai.images.generate({
    //   model: modelId,
    //   prompt,
    //   n: 1,
    // });
    //
    // const imageUrl = response.data?.[0]?.url;
    // if (!imageUrl) {
    //   throw new InternalServerErrorException('Image model returned no image');
    // }
    // return imageUrl;

    // ── Previous: OpenAI DALL·E 3 (kept for easy rollback) ──
    // const apiKey = this.config.get<string>('OPENAI_API_KEY');
    // if (!apiKey) {
    //   throw new InternalServerErrorException('OpenAI API key is not configured (OPENAI_API_KEY)');
    // }
    //
    // let modelId = 'dall-e-3';
    // try {
    //   const config = await this.prisma.aiModelConfig.findUnique({
    //     where: { role: ModelRole.IMAGE_GENERATOR },
    //   });
    //   if (config?.isActive && config.modelId) {
    //     modelId = config.modelId;
    //   }
    // } catch {
    //   /* fall back to dall-e-3 */
    // }
    //
    // const openai = new OpenAI({ apiKey });
    // const response = await openai.images.generate({
    //   model: modelId,
    //   prompt,
    //   n: 1,
    //   size: '1024x1024',
    // });
    //
    // const imageUrl = response.data?.[0]?.url;
    // if (!imageUrl) {
    //   throw new InternalServerErrorException('Image model returned no image');
    // }
    // return imageUrl;
  }
}




// import {
//   HttpException,
//   HttpStatus,
//   Injectable,
//   InternalServerErrorException,
//   Logger,
// } from '@nestjs/common';
// import { ConfigService } from '@nestjs/config';
// import { ModelRole, SubscriptionTier } from '@prisma/client';
// // import { OpenAI } from 'openai'; // needed again if switching back to OpenAI / xAI
// import { PrismaService } from '../../prisma/prisma.service';
// import { CreditService } from '../credit/credit.service';
// import { BusinessProfileService } from '../business-profile/business-profile.service';
// import { ConversationService } from '../conversation/conversation.service';
// import { CREDIT_COST_IMAGE_GENERATION } from '../credit/credit.constants';
// import { GenerateImageDto } from './dto/generate-image.dto';

// @Injectable()
// export class ImageService {
//   private readonly logger = new Logger(ImageService.name);

//   constructor(
//     private readonly prisma: PrismaService,
//     private readonly config: ConfigService,
//     private readonly creditService: CreditService,
//     private readonly businessProfileService: BusinessProfileService,
//     private readonly conversationService: ConversationService,
//   ) {}

//   async generate(userId: string, dto: GenerateImageDto) {
//     // 1. Daily image limit
//     const user = await this.prisma.user.findUnique({
//       where: { id: userId },
//       include: { subscription: true },
//     });
//     if (!user) {
//       throw new HttpException('User not found', HttpStatus.NOT_FOUND);
//     }

//     const tier = user.subscription?.tier ?? SubscriptionTier.FREE;
//     const quota = await this.prisma.quotaConfig.findUnique({ where: { tier } });
//     const dailyImageLimit = quota?.dailyImageLimit ?? null;

//     if (dailyImageLimit !== null) {
//       const startOfDay = new Date();
//       startOfDay.setHours(0, 0, 0, 0);

//       const todayCount = await this.prisma.imageGeneration.count({
//         where: { userId, createdAt: { gte: startOfDay } },
//       });

//       if (todayCount >= dailyImageLimit) {
//         throw new HttpException(
//           {
//             dailyLimitReached: true,
//             message: "You've reached your daily image limit. Upgrade for more.",
//           },
//           HttpStatus.FORBIDDEN,
//         );
//       }
//     }

//     // 2. Credit balance
//     const creditCheck = await this.creditService.checkBalance(
//       userId,
//       CREDIT_COST_IMAGE_GENERATION,
//     );
//     if (!creditCheck.allowed) {
//       throw new HttpException(
//         {
//           creditLimitReached: true,
//           balance: creditCheck.balance,
//           message: 'Not enough credits for image generation.',
//         },
//         HttpStatus.PAYMENT_REQUIRED,
//       );
//     }

//     // 3. Reserve credits
//     const reservation = await this.creditService.reserve(
//       userId,
//       CREDIT_COST_IMAGE_GENERATION,
//       'image generation',
//     );

//     try {
//       // 4. Call Gemini image model
//       const profile = await this.businessProfileService.resolveActiveProfile(userId);
//       const imageUrl = await this.callImageModel(dto);

//       // 5. Confirm + persist ImageGeneration (full image lives here — not in chat messages)
//       await this.creditService.confirm(reservation.reservationId);

//       const imageRecord = await this.prisma.imageGeneration.create({
//         data: {
//           userId,
//           businessProfileId: profile.id,
//           prompt: dto.prompt,
//           imageUrl,
//           creditsDeducted: CREDIT_COST_IMAGE_GENERATION,
//         },
//       });

//       // Short ref for chat history (full base64 is too large for messages / conversation payloads)
//       const imageRef = `image-generation:${imageRecord.id}`;

//       // Track daily count on the date-scoped DailyTask record if one exists
//       const startOfDay = new Date();
//       startOfDay.setHours(0, 0, 0, 0);
//       const endOfDay = new Date(startOfDay);
//       endOfDay.setDate(endOfDay.getDate() + 1);
//       await this.prisma.dailyTask.updateMany({
//         where: {
//           businessProfileId: profile.id,
//           date: { gte: startOfDay, lt: endOfDay },
//         },
//         data: { imageGenerationCount: { increment: 1 } },
//       });

//       await this.creditService.checkAndNotifyLow(userId);

//       const creditStatus = await this.creditService.getStatus(userId);

//       // 6. Optional: also drop into the section chat (ChatGPT-style)
//       type ChatMessageRow = {
//         id: string;
//         conversationId: string;
//         role: string;
//         content: string;
//         imageUrl: string | null;
//         createdAt: Date;
//       };
//       let userMessage: ChatMessageRow | null = null;
//       let assistantMessage: ChatMessageRow | null = null;

//       if (dto.sectionKey) {
//         const conversation = await this.conversationService.getOrCreate(
//           userId,
//           dto.sectionKey,
//         );
//         const typeLabel = dto.type === 'logo' ? 'logo' : 'business card';

//         userMessage = await this.prisma.message.create({
//           data: {
//             conversationId: conversation.id,
//             role: 'user',
//             content: `Generate a ${typeLabel}: ${dto.prompt}`,
//           },
//         });

//         assistantMessage = await this.prisma.message.create({
//           data: {
//             conversationId: conversation.id,
//             role: 'assistant',
//             content: `Here's your ${typeLabel}.`,
//             imageUrl: imageRef,
//           },
//         });
//       }

//       return {
//         imageUrl,
//         imageGenerationId: imageRecord.id,
//         creditStatus,
//         ...(userMessage && assistantMessage
//           ? {
//               userMessage,
//               // Client can show full imageUrl immediately; history uses imageRef
//               assistantMessage: { ...assistantMessage, imageUrl },
//             }
//           : {}),
//       };
//     } catch (err) {
//       // 6. Refund on failure
//       await this.creditService.refund(reservation.reservationId);

//       if (err instanceof HttpException) throw err;

//       this.logger.error(`Image generation failed for ${userId}: ${(err as Error).message}`);
//       throw new InternalServerErrorException('Image generation failed. Credits refunded.');
//     }
//   }

//   /** Resolve a stored chat image ref / ImageGeneration row for the owning user. */
//   async getGenerationForUser(userId: string, generationId: string) {
//     const row = await this.prisma.imageGeneration.findFirst({
//       where: { id: generationId, userId },
//     });
//     if (!row) {
//       throw new HttpException('Image not found', HttpStatus.NOT_FOUND);
//     }
//     return { id: row.id, imageUrl: row.imageUrl, prompt: row.prompt, createdAt: row.createdAt };
//   }

//   private async callImageModel(dto: GenerateImageDto): Promise<string> {
//     const typeContext =
//       dto.type === 'logo'
//         ? 'Design a professional brand logo. Clean, memorable, suitable for business use.'
//         : 'Design a professional business card layout. Clean typography, print-ready look.';
//     const prompt = `${typeContext}\n\n${dto.prompt}`;

//     // ── Active: Gemini image generation ──
//     const apiKey = this.config.get<string>('GOOGLE_AI_API_KEY');
//     if (!apiKey) {
//       throw new InternalServerErrorException(
//         'Google AI API key is not configured (GOOGLE_AI_API_KEY)',
//       );
//     }

//     let modelId = 'gemini-2.5-flash-image';
//     try {
//       const config = await this.prisma.aiModelConfig.findUnique({
//         where: { role: ModelRole.IMAGE_GENERATOR },
//       });
//       // Only honor DB config when it points at Google image models
//       if (config?.isActive && config.provider === 'google' && config.modelId) {
//         modelId = config.modelId;
//       }
//     } catch {
//       /* fall back to gemini-2.5-flash-image */
//     }

//     const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;
//     const geminiRes = await fetch(endpoint, {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify({
//         contents: [{ parts: [{ text: prompt }] }],
//         generationConfig: {
//           responseModalities: ['TEXT', 'IMAGE'],
//         },
//       }),
//     });

//     if (!geminiRes.ok) {
//       const errBody = await geminiRes.text();
//       this.logger.error(`Gemini image API ${geminiRes.status}: ${errBody}`);
//       throw new InternalServerErrorException(
//         `Gemini image generation failed (${geminiRes.status})`,
//       );
//     }

//     const geminiJson = (await geminiRes.json()) as {
//       candidates?: Array<{
//         content?: {
//           parts?: Array<{
//             inlineData?: { mimeType?: string; data?: string };
//             text?: string;
//           }>;
//         };
//       }>;
//     };

//     const parts = geminiJson.candidates?.[0]?.content?.parts ?? [];
//     const imagePart = parts.find((p) => p.inlineData?.data);
//     const mimeType = imagePart?.inlineData?.mimeType ?? 'image/png';
//     const base64 = imagePart?.inlineData?.data;
//     if (!base64) {
//       throw new InternalServerErrorException('Gemini returned no image data');
//     }

//     // Frontend expects a usable src — data URI works for <img> and download
//     return `data:${mimeType};base64,${base64}`;

//     // ── Previous: Grok Imagine / xAI (kept for easy rollback) ──
//     // const apiKey = this.config.get<string>('XAI_API_KEY');
//     // if (!apiKey) {
//     //   throw new InternalServerErrorException('xAI API key is not configured (XAI_API_KEY)');
//     // }
//     //
//     // let modelId = 'grok-imagine-image-quality';
//     // try {
//     //   const config = await this.prisma.aiModelConfig.findUnique({
//     //     where: { role: ModelRole.IMAGE_GENERATOR },
//     //   });
//     //   if (config?.isActive && config.provider === 'xai' && config.modelId) {
//     //     modelId = config.modelId;
//     //   }
//     // } catch {
//     //   /* fall back to grok-imagine-image-quality */
//     // }
//     //
//     // const xai = new OpenAI({
//     //   apiKey,
//     //   baseURL: 'https://api.x.ai/v1',
//     // });
//     // const response = await xai.images.generate({
//     //   model: modelId,
//     //   prompt,
//     //   n: 1,
//     // });
//     //
//     // const imageUrl = response.data?.[0]?.url;
//     // if (!imageUrl) {
//     //   throw new InternalServerErrorException('Image model returned no image');
//     // }
//     // return imageUrl;

//     // ── Previous: OpenAI DALL·E (kept for easy rollback) ──
//     // const apiKey = this.config.get<string>('OPENAI_API_KEY');
//     // if (!apiKey) {
//     //   throw new InternalServerErrorException('OpenAI API key is not configured (OPENAI_API_KEY)');
//     // }
//     //
//     // let modelId = 'dall-e-3';
//     // try {
//     //   const config = await this.prisma.aiModelConfig.findUnique({
//     //     where: { role: ModelRole.IMAGE_GENERATOR },
//     //   });
//     //   if (config?.isActive && config.modelId) {
//     //     modelId = config.modelId;
//     //   }
//     // } catch {
//     //   /* fall back to dall-e-3 */
//     // }
//     //
//     // const openai = new OpenAI({ apiKey });
//     // const response = await openai.images.generate({
//     //   model: modelId,
//     //   prompt,
//     //   n: 1,
//     //   size: '1024x1024',
//     // });
//     //
//     // const imageUrl = response.data?.[0]?.url;
//     // if (!imageUrl) {
//     //   throw new InternalServerErrorException('Image model returned no image');
//     // }
//     // return imageUrl;
//   }
// }

import { ApiPropertyOptional } from '@nestjs/swagger';
import { SubscriptionTier } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsString } from 'class-validator';

export class CreateCheckoutSessionDto {
  @ApiPropertyOptional({
    description: 'Stripe price id. Takes precedence over tier/interval.',
    example: 'price_1QxyzAbCdEfGhIjK',
  })
  @IsOptional()
  @IsString()
  priceId?: string;

  @ApiPropertyOptional({
    enum: SubscriptionTier,
    description: 'Resolve the price from the admin price map by tier.',
  })
  @IsOptional()
  @IsEnum(SubscriptionTier)
  tier?: SubscriptionTier;

  @ApiPropertyOptional({ enum: ['month', 'year'], default: 'month' })
  @IsOptional()
  @IsIn(['month', 'year'])
  interval?: 'month' | 'year';
}

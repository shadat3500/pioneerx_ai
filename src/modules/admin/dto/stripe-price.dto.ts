import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SubscriptionTier } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateStripePriceDto {
  @ApiProperty({
    description: 'Price id copied from the Stripe dashboard',
    example: 'price_1QxyzAbCdEfGhIjK',
  })
  @IsString()
  priceId!: string;

  @ApiProperty({ enum: SubscriptionTier, example: SubscriptionTier.PRO })
  @IsEnum(SubscriptionTier)
  tier!: SubscriptionTier;

  @ApiPropertyOptional({ enum: ['month', 'year'], default: 'month' })
  @IsOptional()
  @IsIn(['month', 'year'])
  interval?: string;

  @ApiPropertyOptional({ example: 'Pro monthly' })
  @IsOptional()
  @IsString()
  label?: string;

  @ApiPropertyOptional({
    description: 'Current/sale amount in minor units (cents) — display only',
    example: 1499,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  amount?: number;

  @ApiPropertyOptional({
    description:
      'Crossed-out / “was” price in minor units (cents). Shown with line-through on the website.',
    example: 2099,
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  compareAtAmount?: number | null;

  @ApiPropertyOptional({ example: 'usd' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateStripePriceDto {
  @ApiPropertyOptional({ enum: SubscriptionTier })
  @IsOptional()
  @IsEnum(SubscriptionTier)
  tier?: SubscriptionTier;

  @ApiPropertyOptional({ enum: ['month', 'year'] })
  @IsOptional()
  @IsIn(['month', 'year'])
  interval?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  label?: string;

  @ApiPropertyOptional({ description: 'Current/sale amount in minor units (cents)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  amount?: number;

  @ApiPropertyOptional({
    description: 'Crossed-out / “was” price in cents. Pass null to clear.',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  compareAtAmount?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

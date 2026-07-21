import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class ApplyPromoDto {
  @ApiProperty({ description: 'Promo code', example: 'LAUNCH30' })
  @IsString()
  @IsNotEmpty()
  code!: string;
}

export class CreatePromoCodeDto {
  @ApiProperty({ example: 'LAUNCH30' })
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiProperty({ description: 'How many days of trial this code gives', example: 30 })
  @IsInt()
  @Min(1)
  trialDays!: number;

  @ApiPropertyOptional({ description: 'Max redemptions. Omit for unlimited.', example: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxUses?: number;

  @ApiPropertyOptional({ description: 'Expiry date (ISO)', example: '2026-12-31T23:59:59Z' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class UpdatePromoCodeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  trialDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  maxUses?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class SubmitReviewDto {
  @ApiPropertyOptional({ example: 'Founder, NovaMint' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  roleCompany?: string;

  @ApiProperty({ example: 'PioneerX replaced 6 separate tools for me.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  reviewText!: string;

  @ApiPropertyOptional({ description: '1–5 star rating', example: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;
}

export class AdminCreateReviewDto {
  @ApiProperty({ example: 'Sarah Chen' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ example: 'Founder, NovaMint' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  roleCompany?: string;

  @ApiProperty({ example: 'PioneerX replaced 6 separate tools for me.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  reviewText!: string;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @ApiPropertyOptional({ example: 'https://example.com/avatar.jpg' })
  @IsOptional()
  @IsString()
  avatarUrl?: string;
}

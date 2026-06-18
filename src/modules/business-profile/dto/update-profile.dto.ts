import { IsEnum, IsOptional, IsString } from 'class-validator';
import { BusinessPhase } from '@prisma/client';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'My Startup LLC' })
  @IsString()
  @IsOptional()
  businessName?: string;

  @ApiPropertyOptional({ example: 'SaaS / AI' })
  @IsString()
  @IsOptional()
  industry?: string;

  @ApiPropertyOptional({ enum: BusinessPhase, example: BusinessPhase.IDEA })
  @IsEnum(BusinessPhase)
  @IsOptional()
  currentPhase?: BusinessPhase;

  @ApiPropertyOptional({ example: 'United States' })
  @IsString()
  @IsOptional()
  country?: string;
}

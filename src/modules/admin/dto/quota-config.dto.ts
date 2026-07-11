import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Min, ValidateIf } from 'class-validator';

export class UpdateQuotaConfigDto {
  @ApiPropertyOptional({
    description: 'Daily token limit. Omit or send null for unlimited.',
    example: 100000,
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1)
  dailyTokenLimit?: number | null;

  @ApiPropertyOptional({
    description: 'Daily regenerate limit. Omit or send null for unlimited.',
    example: 5,
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1)
  dailyRegenerateLimit?: number | null;
}

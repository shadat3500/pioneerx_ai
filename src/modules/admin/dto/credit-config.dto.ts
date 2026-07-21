import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Min, ValidateIf } from 'class-validator';

export class UpdateCreditConfigDto {
  @ApiPropertyOptional({
    description: 'Monthly credits for paid tiers. Send null to disable.',
    example: 15000,
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(0)
  monthlyCredits?: number | null;

  @ApiPropertyOptional({
    description: 'Daily credits for the Free tier. Send null to disable.',
    example: 500,
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(0)
  dailyCredits?: number | null;

  @ApiPropertyOptional({
    description: 'Daily credits during trial. Send null to disable.',
    example: 2000,
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(0)
  trialCredits?: number | null;
}

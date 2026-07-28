import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GenerateImageDto {
  @ApiProperty({ description: 'Image prompt', example: 'Minimal logo for a coffee brand' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  prompt!: string;

  @ApiProperty({ description: 'Image type', enum: ['logo', 'business_card'] })
  @IsIn(['logo', 'business_card'])
  type!: 'logo' | 'business_card';

  /** When set, also append user + assistant messages (with image) to that section's chat. */
  @ApiPropertyOptional({
    description: 'Section key — save the generated image into that section conversation',
    example: 'idea_validation',
  })
  @IsOptional()
  @IsString()
  sectionKey?: string;
}

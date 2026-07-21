import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GenerateImageDto {
  @ApiProperty({ description: 'Image prompt', example: 'Minimal logo for a coffee brand' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  prompt!: string;

  @ApiProperty({ description: 'Image type', enum: ['logo', 'business_card'] })
  @IsIn(['logo', 'business_card'])
  type!: 'logo' | 'business_card';
}

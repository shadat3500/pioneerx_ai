import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateSitePageDto {
  @ApiPropertyOptional({ example: 'About Us' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiProperty({ example: 'PioneerX helps founders…' })
  @IsString()
  @IsNotEmpty()
  body!: string;
}

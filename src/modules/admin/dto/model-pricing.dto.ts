import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateModelPricingDto {
  @ApiProperty({ example: 'openai' })
  @IsString()
  @IsNotEmpty()
  provider!: string;

  @ApiProperty({ example: 'gpt-5.5' })
  @IsString()
  @IsNotEmpty()
  modelId!: string;

  @ApiProperty({ example: 2.5 })
  @IsNumber()
  @Min(0)
  inputPricePerMToken!: number;

  @ApiProperty({ example: 10.0 })
  @IsNumber()
  @Min(0)
  outputPricePerMToken!: number;
}

export class UpdateModelPricingDto {
  @ApiPropertyOptional({ example: 2.5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  inputPricePerMToken?: number;

  @ApiPropertyOptional({ example: 10.0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  outputPricePerMToken?: number;
}

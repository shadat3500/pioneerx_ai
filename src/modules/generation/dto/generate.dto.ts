import { IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GenerateDto {
  @ApiProperty({ example: 'How do I identify my initial market segment?' })
  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  prompt!: string;
}
export class SaveOutputDto {
  @ApiProperty({ example: 'My Custom Label' })
  @IsString()
  @IsNotEmpty()
  label!: string;
}

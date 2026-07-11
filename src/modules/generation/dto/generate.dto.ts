import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SaveOutputDto {
  @ApiProperty({ example: 'My Custom Label' })
  @IsString()
  @IsNotEmpty()
  label!: string;
}

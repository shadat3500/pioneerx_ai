import { IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendMessageDto {
  @ApiProperty({ example: 'How should I validate my SaaS idea with early users?' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  content!: string;
}

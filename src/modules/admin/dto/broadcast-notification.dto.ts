import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class BroadcastNotificationDto {
  @ApiProperty({ enum: ['model_update', 'platform_update'] })
  @IsIn(['model_update', 'platform_update'])
  type!: 'model_update' | 'platform_update';

  @ApiProperty({ example: 'A new AI model has been added to PioneerX.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  message!: string;
}

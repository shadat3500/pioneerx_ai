import { Body, Controller, Get, HttpCode, HttpStatus, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BusinessProfileService } from './business-profile.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { GetCurrentUser } from '../auth/decorators/get-current-user.decorator';

@ApiTags('BusinessProfile')
@ApiBearerAuth()
@Controller('profile')
export class BusinessProfileController {
  constructor(private readonly businessProfileService: BusinessProfileService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get current user business profile' })
  getProfile(@GetCurrentUser('sub') userId: string) {
    return this.businessProfileService.getProfile(userId);
  }

  @Patch()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create or update business profile' })
  updateProfile(
    @GetCurrentUser('sub') userId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.businessProfileService.updateProfile(userId, dto);
  }
}

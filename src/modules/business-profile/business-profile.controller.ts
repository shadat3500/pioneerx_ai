import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BusinessProfileService } from './business-profile.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CreateProfileDto } from './dto/create-profile.dto';
import { GetCurrentUser } from '../auth/decorators/get-current-user.decorator';

@ApiTags('BusinessProfile')
@ApiBearerAuth()
@Controller()
export class BusinessProfileController {
  constructor(private readonly businessProfileService: BusinessProfileService) {}

  @Get('profile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get active profile and all profiles for current user' })
  getProfile(@GetCurrentUser('sub') userId: string) {
    return this.businessProfileService.getProfileContext(userId);
  }

  @Patch('profile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update the active business profile' })
  updateProfile(
    @GetCurrentUser('sub') userId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.businessProfileService.updateActiveProfile(userId, dto);
  }

  @Post('business-profiles')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new business profile' })
  createProfile(
    @GetCurrentUser('sub') userId: string,
    @Body() dto: CreateProfileDto,
  ) {
    return this.businessProfileService.createProfile(userId, dto);
  }

  @Get('business-profiles')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List all business profiles for current user' })
  listProfiles(@GetCurrentUser('sub') userId: string) {
    return this.businessProfileService.listProfiles(userId);
  }

  @Get('business-profiles/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get a single business profile' })
  getProfileById(
    @GetCurrentUser('sub') userId: string,
    @Param('id') profileId: string,
  ) {
    return this.businessProfileService.getProfileById(userId, profileId);
  }

  @Patch('business-profiles/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a business profile' })
  updateProfileById(
    @GetCurrentUser('sub') userId: string,
    @Param('id') profileId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.businessProfileService.updateProfileById(userId, profileId, dto);
  }

  @Delete('business-profiles/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a business profile (requires more than one)' })
  deleteProfile(
    @GetCurrentUser('sub') userId: string,
    @Param('id') profileId: string,
  ) {
    return this.businessProfileService.deleteProfile(userId, profileId);
  }

  @Post('business-profiles/:id/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set a business profile as active' })
  activateProfile(
    @GetCurrentUser('sub') userId: string,
    @Param('id') profileId: string,
  ) {
    return this.businessProfileService.activateProfile(userId, profileId);
  }
}

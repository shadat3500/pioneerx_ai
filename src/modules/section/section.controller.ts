import { Controller, Get, HttpCode, HttpStatus, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SectionService } from './section.service';
import { GetCurrentUser } from '../auth/decorators/get-current-user.decorator';
import { SectionAccessGuard } from '../generation/guards/section-access.guard';

@ApiTags('Sections')
@ApiBearerAuth()
@Controller('sections')
export class SectionController {
  constructor(private readonly sectionService: SectionService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all active sections available for the current user subscription tier' })
  findAll(@GetCurrentUser('sub') userId: string) {
    return this.sectionService.findAllForUser(userId);
  }

  @Get(':key')
  @UseGuards(SectionAccessGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get details of a specific section' })
  findOne(@Param('key') key: string) {
    return this.sectionService.findOne(key);
  }
}

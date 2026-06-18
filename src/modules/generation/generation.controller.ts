import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GenerationService } from './generation.service';
import { GenerateDto, SaveOutputDto } from './dto/generate.dto';
import { GetCurrentUser } from '../auth/decorators/get-current-user.decorator';
import { SectionAccessGuard } from './guards/section-access.guard';

@ApiTags('Generation')
@ApiBearerAuth()
@Controller()
export class GenerationController {
  constructor(private readonly generationService: GenerationService) {}

  @Post('sections/:key/generate')
  @UseGuards(SectionAccessGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate advisory advice for a specific section using MoA' })
  generate(
    @GetCurrentUser('sub') userId: string,
    @Param('key') sectionKey: string,
    @Body() dto: GenerateDto,
  ) {
    return this.generationService.generate(userId, sectionKey, dto.prompt);
  }

  @Get('generations/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get details of a specific generation' })
  findOne(@GetCurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.generationService.findOne(userId, id);
  }

  @Post('generations/:id/save')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Save generation advisory output' })
  saveOutput(
    @GetCurrentUser('sub') userId: string,
    @Param('id') id: string,
    @Body() dto: SaveOutputDto,
  ) {
    return this.generationService.saveOutput(userId, id, dto.label);
  }

  @Delete('generations/:id/save')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unsave/remove generation output from saved library' })
  unsaveOutput(@GetCurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.generationService.unsaveOutput(userId, id);
  }

  @Get('saved-outputs')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retrieve all saved outputs for current user' })
  getSavedOutputs(@GetCurrentUser('sub') userId: string) {
    return this.generationService.getSavedOutputs(userId);
  }
}

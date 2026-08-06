import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConversationService } from './conversation.service';
import { SendMessageDto } from './dto/send-message.dto';
import { GetCurrentUser } from '../auth/decorators/get-current-user.decorator';
import { SectionAccessGuard } from '../generation/guards/section-access.guard';

@ApiTags('Conversations')
@ApiBearerAuth()
@Controller('conversations')
export class ConversationController {
  constructor(private readonly conversationService: ConversationService) {}

  @Post('session/reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Clear active chat pointers after login (does not delete conversations or saved outputs)',
  })
  resetSession(@GetCurrentUser('sub') userId: string) {
    return this.conversationService.resetSession(userId);
  }

  @Get(':sectionKey')
  @UseGuards(SectionAccessGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Get active conversation for profile + section (creates empty thread if none active)',
  })
  getOrCreate(
    @GetCurrentUser('sub') userId: string,
    @Param('sectionKey') sectionKey: string,
  ) {
    return this.conversationService.getOrCreate(userId, sectionKey);
  }

  @Post(':sectionKey/new')
  @UseGuards(SectionAccessGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start a fresh empty conversation for this section' })
  startFresh(
    @GetCurrentUser('sub') userId: string,
    @Param('sectionKey') sectionKey: string,
  ) {
    return this.conversationService.startFresh(userId, sectionKey);
  }

  @Post(':sectionKey/message')
  @UseGuards(SectionAccessGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a user message and receive AI reply' })
  sendMessage(
    @GetCurrentUser('sub') userId: string,
    @Param('sectionKey') sectionKey: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.conversationService.sendMessage(userId, sectionKey, dto.content);
  }

  @Post(':sectionKey/generate')
  @UseGuards(SectionAccessGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate action steps + suggested links from conversation' })
  generate(
    @GetCurrentUser('sub') userId: string,
    @Param('sectionKey') sectionKey: string,
  ) {
    return this.conversationService.generate(userId, sectionKey);
  }
}

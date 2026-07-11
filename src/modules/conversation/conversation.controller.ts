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

  @Get(':sectionKey')
  @UseGuards(SectionAccessGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get or create conversation for active profile + section' })
  getOrCreate(
    @GetCurrentUser('sub') userId: string,
    @Param('sectionKey') sectionKey: string,
  ) {
    return this.conversationService.getOrCreate(userId, sectionKey);
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

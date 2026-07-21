import { Controller, Get, HttpCode, HttpStatus, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { NotificationService } from './notification.service';
import { GetCurrentUser } from '../auth/decorators/get-current-user.decorator';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List unread notifications for current user' })
  list(@GetCurrentUser('sub') userId: string) {
    return this.notificationService.listUnread(userId);
  }

  @Patch('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark all notifications as read' })
  markAllRead(@GetCurrentUser('sub') userId: string) {
    return this.notificationService.markAllRead(userId);
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark one notification as read' })
  markRead(@GetCurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.notificationService.markRead(userId, id);
  }
}

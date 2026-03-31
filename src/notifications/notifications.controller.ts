import {Controller, Get, Patch, Param, UseGuards, Request, Delete} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Notifications')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les notifications' })
  findAll(@Request() req) { return this.notificationsService.findAll(req.user.companyId); }

  @Get('unread-count')
  @ApiOperation({ summary: 'Nombre de notifications non lues' })
  unreadCount(@Request() req) { return this.notificationsService.getUnreadCount(req.user.companyId); }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Marquer une notification comme lue' })
  markRead(@Param('id') id: string, @Request() req) { return this.notificationsService.markRead(id, req.user.companyId); }

  @Patch('read-all')
  @ApiOperation({ summary: 'Tout marquer comme lu' })
  markAllRead(@Request() req) { return this.notificationsService.markAllRead(req.user.companyId); }

  @Delete(':id')
    @ApiOperation({ summary: 'Supprimer une notification' })
    delete(@Param('id') id: string, @Request() req) { return this.notificationsService.delete(id, req.user.companyId); }
}

import {
  Controller,
  Get,
  Inject,
  Injectable,
  Module,
  Param,
  ParseIntPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { Knex } from 'knex';
import { KNEX_CONNECTION } from '../database/knex.module';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { EmailService, EmailType } from '../email/email.service';

export type NotifyInput = {
  recipient_id: number;
  type: string;
  title: string;
  body?: string;
  link?: string;
  task_id?: number;
  // When set, also send an email to the recipient.
  email?: { subject: string; html: string; type: EmailType };
};

// In-app notification feed (the bell). Other modules inject NotificationsService
// and call create()/createMany() to drop a notification on someone's feed, with
// an optional email copy. The feed itself is read via /notifications/mine.
@Injectable()
export class NotificationsService {
  constructor(
    @Inject(KNEX_CONNECTION) private readonly db: Knex,
    private readonly mail: EmailService,
  ) {}

  async create(input: NotifyInput) {
    const [id] = await this.db('app_notifications').insert({
      recipient_id: input.recipient_id,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
      task_id: input.task_id ?? null,
    });
    if (input.email) {
      const emp = await this.db('employees')
        .where({ id: input.recipient_id, is_active: true, is_deleted: false })
        .first('email');
      if (emp?.email) {
        // Fire-and-forget — never let a mail failure break the originating write.
        void this.mail
          .send({ to: emp.email, ...input.email })
          .catch(() => undefined);
      }
    }
    return id;
  }

  // De-duplicates recipients and skips a given id (e.g. don't notify the actor).
  async createMany(recipientIds: number[], input: Omit<NotifyInput, 'recipient_id'>, exclude?: number) {
    const unique = [...new Set(recipientIds)].filter((id) => id && id !== exclude);
    await Promise.all(unique.map((recipient_id) => this.create({ ...input, recipient_id })));
  }

  list(recipient_id: number, limit = 30) {
    return this.db('app_notifications')
      .where({ recipient_id })
      .orderBy('created_at', 'desc')
      .limit(limit);
  }

  async unreadCount(recipient_id: number) {
    const row = await this.db('app_notifications')
      .where({ recipient_id, is_read: false })
      .count({ c: 'id' })
      .first();
    return { count: Number(row?.c || 0) };
  }

  async markRead(recipient_id: number, id: number) {
    await this.db('app_notifications').where({ id, recipient_id }).update({ is_read: true });
    return { ok: true };
  }

  async markAllRead(recipient_id: number) {
    await this.db('app_notifications').where({ recipient_id, is_read: false }).update({ is_read: true });
    return { ok: true };
  }
}

@Controller('notifications')
class NotificationsController {
  constructor(private readonly s: NotificationsService) {}

  @Get('mine')
  mine(@CurrentUser() user: AuthUser, @Query('limit') limit?: string) {
    return this.s.list(user.id, limit ? Number(limit) : 30);
  }

  @Get('mine/unread-count')
  unread(@CurrentUser() user: AuthUser) {
    return this.s.unreadCount(user.id);
  }

  @Patch('read-all')
  readAll(@CurrentUser() user: AuthUser) {
    return this.s.markAllRead(user.id);
  }

  @Patch(':id/read')
  read(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.s.markRead(user.id, id);
  }
}

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}

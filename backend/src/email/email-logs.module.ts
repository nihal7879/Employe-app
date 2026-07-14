import { Controller, Get, Inject, Injectable, Module, Patch, Query, UseGuards } from '@nestjs/common';
import { Knex } from 'knex';
import { KNEX_CONNECTION } from '../database/knex.module';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';

@Injectable()
class EmailLogsService {
  constructor(@Inject(KNEX_CONNECTION) private readonly db: Knex) {}
  list(params: { status?: string; email_type?: string; date?: string; limit?: number }) {
    let q = this.db('email_logs').orderBy('created_at', 'desc');
    if (params.status) q = q.where('status', params.status);
    if (params.email_type) q = q.where('email_type', params.email_type);
    // Optional single-day filter (YYYY-MM-DD) for the admin notifications calendar.
    if (params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date)) {
      q = q.whereRaw('DATE(created_at) = ?', [params.date]);
    }
    return q.limit(Number(params.limit || 200));
  }
  listForEmail(email: string, limit = 30) {
    return this.db('email_logs').where('email_to', email).orderBy('created_at', 'desc').limit(limit);
  }

  // Email logs carry no per-recipient read flag, so "unread" is everything that
  // landed after the user last opened the Emails tab. An admin's feed is every
  // log; everyone else only sees mail addressed to them.
  async unreadCount(user: AuthUser) {
    const emp = await this.db('employees').where({ id: user.id }).first('email_notifs_seen_at');
    const seenAt = emp?.email_notifs_seen_at;
    let q = this.db('email_logs');
    if (user.role !== 'Admin') q = q.where('email_to', user.email);
    if (seenAt) q = q.where('created_at', '>', seenAt);
    const row = await q.count({ c: 'id' }).first();
    return { count: Number(row?.c || 0) };
  }

  async markSeen(user: AuthUser) {
    await this.db('employees').where({ id: user.id }).update({ email_notifs_seen_at: this.db.fn.now() });
    return { ok: true };
  }
}

@Controller('email-logs')
@UseGuards(RolesGuard)
@Roles('Admin')
class EmailLogsController {
  constructor(private readonly s: EmailLogsService) {}

  // Current user's own notifications (any authenticated role).
  @Get('mine')
  @Roles('Admin', 'Manager', 'Employee')
  mine(@CurrentUser() user: AuthUser) {
    return this.s.listForEmail(user.email);
  }

  // Badge count for the bell's Emails tab, and the acknowledgement that clears
  // it. Stored per user so it survives a logout, a new browser, or a new device.
  @Get('mine/unread-count')
  @Roles('Admin', 'Manager', 'Employee')
  unread(@CurrentUser() user: AuthUser) {
    return this.s.unreadCount(user);
  }

  @Patch('mine/seen')
  @Roles('Admin', 'Manager', 'Employee')
  seen(@CurrentUser() user: AuthUser) {
    return this.s.markSeen(user);
  }

  @Get()
  list(
    @Query('status') status?: string,
    @Query('email_type') email_type?: string,
    @Query('date') date?: string,
    @Query('limit') limit?: number,
  ) {
    return this.s.list({ status, email_type, date, limit });
  }
}

@Module({ controllers: [EmailLogsController], providers: [EmailLogsService] })
export class EmailLogsModule {}

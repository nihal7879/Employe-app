import { Body, Controller, Get, Inject, Injectable, Module, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { Knex } from 'knex';
import type { Request } from 'express';
import { KNEX_CONNECTION } from '../database/knex.module';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { getRequestContext } from '../common/utils/request-context';

@Injectable()
class AuditService {
  constructor(@Inject(KNEX_CONNECTION) private readonly db: Knex) {}

  list(params: { employee_id?: string; event_type?: string; from?: string; to?: string; limit?: string }) {
    let q = this.db('audit_logs')
      .leftJoin('employees', 'audit_logs.employee_id', 'employees.id')
      .select(
        'audit_logs.id',
        'audit_logs.employee_id',
        'audit_logs.employee_email',
        'employees.name as employee_name',
        'audit_logs.event_type',
        'audit_logs.ip',
        'audit_logs.gps',
        'audit_logs.device',
        'audit_logs.browser',
        'audit_logs.user_agent',
        'audit_logs.created_at',
      )
      .orderBy('audit_logs.created_at', 'desc');

    if (params.employee_id) q = q.where('audit_logs.employee_id', Number(params.employee_id));
    if (params.event_type) q = q.where('audit_logs.event_type', params.event_type);
    if (params.from) q = q.where('audit_logs.created_at', '>=', params.from);
    if (params.to) q = q.where('audit_logs.created_at', '<=', params.to);

    const limit = Math.max(1, Math.min(1000, Number(params.limit) || 200));
    return q.limit(limit);
  }

  // Patch the most recent Login row for this employee with the supplied GPS
  // (and refreshed ip/device/browser). Used by the frontend to back-fill the
  // login audit row once the browser finally returns coordinates, which often
  // happens a few hundred ms AFTER the login request itself.
  //
  // Both freshness ("within last 10 minutes") and "still empty" guards are
  // evaluated in SQL — that keeps the comparison timezone-safe regardless of
  // how knex returns the timestamp to JS.
  async backfillLastLoginGps(employee_id: number, gps: string, ctx: { ip?: string; device?: string | null; browser?: string | null }) {
    const row = await this.db('audit_logs')
      .where({ employee_id, event_type: 'Login' })
      .whereNull('gps')
      .whereRaw('created_at >= NOW() - INTERVAL 10 MINUTE')
      .orderBy('created_at', 'desc')
      .first('id');
    // eslint-disable-next-line no-console
    console.log(`[audit] backfillLastLoginGps emp=${employee_id} gps=${gps} match=${row?.id || 'none'}`);
    if (!row) return { updated: 0 };
    const update: Record<string, unknown> = { gps };
    if (ctx.ip) update.ip = ctx.ip;
    if (ctx.device) update.device = ctx.device;
    if (ctx.browser) update.browser = ctx.browser;
    await this.db('audit_logs').where({ id: row.id }).update(update);
    return { updated: 1, id: row.id };
  }

  // Login count per employee — useful for admin dashboard
  async loginCounts(params: { from?: string; to?: string }) {
    let q = this.db('audit_logs')
      .leftJoin('employees', 'audit_logs.employee_id', 'employees.id')
      .where('audit_logs.event_type', 'Login')
      .groupBy('audit_logs.employee_id', 'employees.name', 'audit_logs.employee_email')
      .select(
        'audit_logs.employee_id',
        'employees.name as employee_name',
        'audit_logs.employee_email',
      )
      .count<{ logins: number }[]>({ logins: 'audit_logs.id' })
      .max({ last_login: 'audit_logs.created_at' })
      .orderBy('logins', 'desc');
    if (params.from) q = q.where('audit_logs.created_at', '>=', params.from);
    if (params.to) q = q.where('audit_logs.created_at', '<=', params.to);
    return q;
  }
}

@Controller('audit')
@UseGuards(RolesGuard)
class AuditController {
  constructor(private readonly s: AuditService) {}

  @Get('logs')
  @Roles('Admin')
  list(@Query() q: { employee_id?: string; event_type?: string; from?: string; to?: string; limit?: string }) {
    return this.s.list(q);
  }

  @Get('login-counts')
  @Roles('Admin')
  counts(@Query() q: { from?: string; to?: string }) {
    return this.s.loginCounts(q);
  }

  // Open to any authenticated user — they can only backfill their OWN last
  // Login row (employee_id is taken from the JWT, never the body).
  @Patch('login/backfill-gps')
  backfill(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Body() body: { gps: string },
  ) {
    if (!body?.gps) return { updated: 0 };
    const ctx = getRequestContext(req);
    return this.s.backfillLastLoginGps(user.id, String(body.gps), { ip: ctx.ip, device: ctx.device, browser: ctx.browser });
  }
}

@Module({ controllers: [AuditController], providers: [AuditService] })
export class AuditModule {}

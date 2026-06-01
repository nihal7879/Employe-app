import { Body, Controller, Get, Inject, Injectable, Module, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { Knex } from 'knex';
import type { Request } from 'express';
import { KNEX_CONNECTION } from '../database/knex.module';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { getRequestContext } from '../common/utils/request-context';
import { APP_CONFIG } from '../config/app-config';

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
      .whereRaw('created_at >= NOW() - INTERVAL ? MINUTE', [APP_CONFIG.gpsBackfillWindowMinutes])
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

  // First Login event for the given employee on the given date, restricted
  // to the 8:00–23:59 window. Excludes 12 AM–7:59 AM logins (midnight auto-
  // refresh, pre-dawn testing) — the first login at or after 8 AM, even if
  // it's late evening, becomes the start of the work day.
  async dayStart(employee_id: number, date: string) {
    const row = await this.db('audit_logs')
      .where({ employee_id, event_type: 'Login' })
      .whereRaw('DATE(created_at) = ?', [date])
      .whereRaw('TIME(created_at) BETWEEN ? AND ?', [APP_CONFIG.dayStart.earliest, APP_CONFIG.dayStart.latest])
      .orderBy('created_at', 'asc')
      .first('id', 'created_at');
    if (!row) return { start_time: null, earliest_task_time: null, audit_id: null };
    // Return just HH:MM:SS so the frontend can compare with daily_tasks.start_time
    const created = String(row.created_at);
    const m = created.match(/(\d{2}):(\d{2}):(\d{2})/);
    const start_time = m ? `${m[1]}:${m[2]}:${m[3]}` : null;
    // The actual floor the task-time picker should enforce: the login minus the
    // configurable grace window (LOGIN_GRACE_MINUTES). Driving this from the API
    // keeps the grace runtime-tunable on the backend with no frontend rebuild.
    let earliest_task_time = start_time;
    if (start_time) {
      const mins = Math.max(
        0,
        Number(m![1]) * 60 + Number(m![2]) - APP_CONFIG.loginGraceMinutes,
      );
      const hh = String(Math.floor(mins / 60)).padStart(2, '0');
      const mm = String(mins % 60).padStart(2, '0');
      earliest_task_time = `${hh}:${mm}:00`;
    }
    return { start_time, earliest_task_time, audit_id: row.id };
  }

  // First Login + LAST Logout per day across a range. Powers the activity
  // calendar's in/out stamps. Logout sources we deliberately include:
  //   • manual sign-out (the dropdown)
  //   • 20-min idle logout (frontend posts /auth/logout)
  //   • tab close / browser quit (pagehide beacon → /auth/logout)
  // Taking MAX(Logout) gives the true end of the work session even when an
  // employee signs in/out multiple times across the day.
  //
  // Login times respect the day-start window; logout times do not (a logout
  // captured at 11 PM should still surface as the work-day's bookend).
  async dayBoundsRange(employee_id: number, from: string, to: string) {
    const logins = await this.db('audit_logs')
      .where({ employee_id, event_type: 'Login' })
      .whereRaw('DATE(created_at) BETWEEN ? AND ?', [from, to])
      .whereRaw('TIME(created_at) BETWEEN ? AND ?', [APP_CONFIG.dayStart.earliest, APP_CONFIG.dayStart.latest])
      .groupBy(this.db.raw('DATE(created_at)'))
      .select(this.db.raw('DATE(created_at) as d'), this.db.raw('MIN(created_at) as ts'));

    const logouts = await this.db('audit_logs')
      .where({ employee_id, event_type: 'Logout' })
      .whereRaw('DATE(created_at) BETWEEN ? AND ?', [from, to])
      .groupBy(this.db.raw('DATE(created_at)'))
      .select(this.db.raw('DATE(created_at) as d'), this.db.raw('MAX(created_at) as ts'));

    // MySQL2 returns DATETIME columns as JS Date objects (server-local TZ);
    // DATE() can come back as either a Date or a 'YYYY-MM-DD' string depending
    // on driver config. Handle both robustly — otherwise the keys here won't
    // match the YYYY-MM-DD keys the frontend uses to look bounds up.
    const toHMS = (ts: unknown): string | null => {
      if (ts instanceof Date) {
        const h = String(ts.getHours()).padStart(2, '0');
        const mi = String(ts.getMinutes()).padStart(2, '0');
        const s = String(ts.getSeconds()).padStart(2, '0');
        return `${h}:${mi}:${s}`;
      }
      const m = String(ts).match(/(\d{2}):(\d{2}):(\d{2})/);
      return m ? `${m[1]}:${m[2]}:${m[3]}` : null;
    };
    const toKey = (d: unknown): string => {
      if (d instanceof Date) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${dd}`;
      }
      const s = String(d);
      const m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
      return m ? `${m[1]}-${m[2]}-${m[3]}` : s.slice(0, 10);
    };

    const out: Record<string, { first_login: string | null; last_logout: string | null }> = {};
    for (const r of logins as Array<{ d: unknown; ts: unknown }>) {
      const k = toKey(r.d);
      out[k] = out[k] || { first_login: null, last_logout: null };
      out[k].first_login = toHMS(r.ts);
    }
    for (const r of logouts as Array<{ d: unknown; ts: unknown }>) {
      const k = toKey(r.d);
      out[k] = out[k] || { first_login: null, last_logout: null };
      out[k].last_logout = toHMS(r.ts);
    }
    return out;
  }

  // Per-employee presence for ANY single date: who logged in that day, with
  // their earliest Login and latest Logout. Mirrors the dashboard's
  // "present_today" block but parameterized by date so the admin can browse a
  // calendar. Non-admin, active employees only; ordered by login time.
  async presentOnDate(date: string) {
    return this.db('audit_logs as a')
      .innerJoin('employees', 'a.employee_id', 'employees.id')
      .leftJoin('roles', 'employees.role_id', 'roles.id')
      .leftJoin('departments', 'employees.department_id', 'departments.id')
      .whereRaw('DATE(a.created_at) = ?', [date])
      .andWhere({ 'employees.is_active': true, 'employees.is_deleted': false })
      .whereNot('roles.role_name', 'Admin')
      .whereExists(function () {
        this.select('*').from('audit_logs as a2')
          .whereRaw('a2.employee_id = a.employee_id')
          .andWhereRaw('DATE(a2.created_at) = ?', [date])
          .andWhere('a2.event_type', 'Login');
      })
      .groupBy(
        'employees.id', 'employees.name', 'employees.email',
        'employees.employee_code', 'departments.department_name',
      )
      .select(
        'employees.id',
        'employees.name',
        'employees.email',
        'employees.employee_code',
        'departments.department_name',
        this.db.raw("MIN(CASE WHEN a.event_type = 'Login'  THEN a.created_at END) as first_login"),
        this.db.raw("MAX(CASE WHEN a.event_type = 'Logout' THEN a.created_at END) as last_logout"),
      )
      .orderByRaw("MIN(CASE WHEN a.event_type = 'Login' THEN a.created_at END) asc");
  }

  // Compliance: employees who logged one or more tasks that START BEFORE their
  // first login of the day (the login-grace "override"). For each such employee
  // on the given date, returns their first login, how many tasks predate it,
  // and the earliest such start time — so an admin can see who back-dated.
  async loginMismatches(date: string) {
    // First login per employee on the date, restricted to the day-start window.
    const firstLogins = this.db('audit_logs')
      .where('event_type', 'Login')
      .whereRaw('DATE(created_at) = ?', [date])
      .whereRaw('TIME(created_at) BETWEEN ? AND ?', [APP_CONFIG.dayStart.earliest, APP_CONFIG.dayStart.latest])
      .groupBy('employee_id')
      .select('employee_id')
      .min({ first_login: 'created_at' })
      .as('fl');

    return this.db('daily_tasks as dt')
      .join('employees as e', 'e.id', 'dt.employee_id')
      .leftJoin('departments as d', 'e.department_id', 'd.id')
      .join(firstLogins, 'fl.employee_id', 'dt.employee_id')
      .where('dt.is_deleted', false)
      .andWhere('dt.task_date', date)
      .whereNotNull('dt.start_time')
      // start_time ("HH:MM:SS") strictly before the login's time-of-day.
      .whereRaw('dt.start_time < TIME(fl.first_login)')
      .groupBy('e.id', 'e.name', 'e.employee_code', 'e.email', 'd.department_name')
      .select(
        'e.id',
        'e.name',
        'e.employee_code',
        'e.email',
        'd.department_name',
        this.db.raw('TIME(MIN(fl.first_login)) as first_login'),
        this.db.raw('MIN(dt.start_time) as earliest_task'),
      )
      .count({ tasks_before_login: 'dt.id' })
      .orderBy('tasks_before_login', 'desc');
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

  // Returns the employee's day-start time (first Login within 8 AM – 8 PM).
  // Employees see only their own; admins can pass ?employee_id=N.
  @Get('day-start')
  dayStart(
    @CurrentUser() user: AuthUser,
    @Query('date') date: string,
    @Query('employee_id') employeeIdParam?: string,
  ) {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return { start_time: null, audit_id: null };
    }
    const empId = user.role === 'Admin' && employeeIdParam ? Number(employeeIdParam) : user.id;
    return this.s.dayStart(empId, date);
  }

  // Per-employee presence for a single date (who logged in, with first login /
  // last logout). Admin-only — powers the calendar-driven "Present" page.
  @Get('present')
  @Roles('Admin')
  present(@Query('date') date: string) {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
    return this.s.presentOnDate(date);
  }

  // Employees who logged tasks starting before their first login on a date
  // (the login-grace override). Admin-only — powers the compliance view.
  @Get('login-mismatches')
  @Roles('Admin')
  loginMismatches(@Query('date') date: string) {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
    return this.s.loginMismatches(date);
  }

  // Per-day in/out times across a date range. Used by the activity calendar
  // (day / week / month views). Returns an object keyed by YYYY-MM-DD.
  @Get('day-bounds')
  dayBounds(
    @CurrentUser() user: AuthUser,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('employee_id') employeeIdParam?: string,
  ) {
    if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return {};
    }
    const empId = user.role === 'Admin' && employeeIdParam ? Number(employeeIdParam) : user.id;
    return this.s.dayBoundsRange(empId, from, to);
  }
}

@Module({ controllers: [AuditController], providers: [AuditService] })
export class AuditModule {}

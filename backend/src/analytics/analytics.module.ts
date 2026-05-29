import { Controller, Get, Inject, Injectable, Module, Query, UseGuards } from '@nestjs/common';
import { Knex } from 'knex';
import { KNEX_CONNECTION } from '../database/knex.module';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

@Injectable()
class AnalyticsService {
  constructor(@Inject(KNEX_CONNECTION) private readonly db: Knex) {}

  // ---- Lightweight summary: just the stat-card counts. Fast & cheap.
  async summary() {
    const today = new Date().toISOString().slice(0, 10);
    const ydate = new Date(today + 'T00:00:00Z');
    ydate.setUTCDate(ydate.getUTCDate() - 1);
    const yesterday = ydate.toISOString().slice(0, 10);

    const [
      activeEmployees,
      todayTotals,
      presentTodayCount,
      todayClientsCount,
      todayProjectsCount,
      yesterdayPendingCount,
    ] = await Promise.all([
      this.db('employees')
        .leftJoin('roles', 'employees.role_id', 'roles.id')
        .where({ 'employees.is_active': true, 'employees.is_deleted': false })
        .whereNot('roles.role_name', 'Admin')
        .count<{ c: number }[]>({ c: '*' }).first(),
      this.db('daily_tasks').where({ is_deleted: false, task_date: today }).sum({ hours: 'hours_spent' }).count({ tasks: '*' }).first(),
      this.db('audit_logs as a')
        .innerJoin('employees', 'a.employee_id', 'employees.id')
        .leftJoin('roles', 'employees.role_id', 'roles.id')
        .whereRaw('DATE(a.created_at) = ?', [today])
        .andWhere('a.event_type', 'Login')
        .andWhere({ 'employees.is_active': true, 'employees.is_deleted': false })
        .whereNot('roles.role_name', 'Admin')
        .countDistinct<{ c: number }[]>({ c: 'employees.id' }).first(),
      this.db('daily_tasks')
        .where('is_deleted', false).andWhere('is_break', false).andWhere('task_date', today)
        .whereNotNull('client_id')
        .countDistinct<{ c: number }[]>({ c: 'client_id' }).first(),
      this.db('daily_tasks')
        .where('is_deleted', false).andWhere('is_break', false).andWhere('task_date', today)
        .whereNotNull('project_id')
        .countDistinct<{ c: number }[]>({ c: 'project_id' }).first(),
      this.db('employees')
        .where({ 'employees.is_active': true, 'employees.is_deleted': false, 'employees.role_id': 2 })
        .whereNotIn(
          'employees.id',
          this.db('daily_tasks')
            .where({ is_deleted: false, task_date: yesterday })
            .whereNotNull('employee_id')
            .select('employee_id'),
        )
        .count<{ c: number }[]>({ c: '*' }).first(),
    ]);

    return {
      counts: {
        active_employees: activeEmployees?.c || 0,
        present_today: presentTodayCount?.c || 0,
        today_clients: todayClientsCount?.c || 0,
        today_projects: todayProjectsCount?.c || 0,
        yesterday_pending: yesterdayPendingCount?.c || 0,
      },
      today: todayTotals,
    };
  }

  // ---- Period-dependent slice: charts that depend on date range
  async period(params: { from?: string; to?: string; period?: string } = {}) {
    const range = resolveRange(params);
    const monthStart = range.from;
    const monthEnd = range.to;

    const trendStart = new Date(); trendStart.setDate(trendStart.getDate() - 29);
    const trendStartStr = trendStart.toISOString().slice(0, 10);

    const [
      activityDist,
      topProjects,
      topClients,
      topEmployees,
      dailyTrend,
      hoursByWeekday,
      projectActivity,
    ] = await Promise.all([
      this.db('daily_tasks')
        .leftJoin('activities', 'daily_tasks.activity_id', 'activities.id')
        .where('daily_tasks.is_deleted', false)
        .andWhere('daily_tasks.is_break', false)
        .andWhereBetween('daily_tasks.task_date', [monthStart, monthEnd])
        .groupBy('activities.activity_name')
        .select(this.db.raw("COALESCE(activities.activity_name, 'Other') as activity_name"))
        .sum({ total_hours: 'hours_spent' })
        .orderBy('total_hours', 'desc'),
      this.db('daily_tasks')
        .leftJoin('projects', 'daily_tasks.project_id', 'projects.id')
        .where('daily_tasks.is_deleted', false)
        .andWhere('daily_tasks.is_break', false)
        .andWhereBetween('daily_tasks.task_date', [monthStart, monthEnd])
        .whereNotNull('daily_tasks.project_id')
        .groupBy('projects.project_name')
        .select('projects.project_name')
        .sum({ total_hours: 'hours_spent' })
        .orderBy('total_hours', 'desc')
        .limit(5),
      this.db('daily_tasks')
        .leftJoin('clients', 'daily_tasks.client_id', 'clients.id')
        .where('daily_tasks.is_deleted', false)
        .andWhere('daily_tasks.is_break', false)
        .andWhereBetween('daily_tasks.task_date', [monthStart, monthEnd])
        .whereNotNull('daily_tasks.client_id')
        .groupBy('clients.client_name')
        .select('clients.client_name')
        .sum({ total_hours: 'hours_spent' })
        .orderBy('total_hours', 'desc')
        .limit(5),
      this.db('daily_tasks')
        .leftJoin('employees', 'daily_tasks.employee_id', 'employees.id')
        .where('daily_tasks.is_deleted', false)
        .andWhereBetween('daily_tasks.task_date', [monthStart, monthEnd])
        .groupBy('employees.name')
        .select('employees.name')
        .sum({ total_hours: 'hours_spent' })
        .count({ tasks: '*' })
        .orderBy('total_hours', 'desc')
        .limit(5),
      this.db('daily_tasks')
        .where('is_deleted', false)
        .andWhere('task_date', '>=', trendStartStr)
        .groupBy('task_date')
        .select('task_date')
        .sum({ hours: 'hours_spent' })
        .count({ tasks: '*' })
        .orderBy('task_date', 'asc'),
      // Server-aggregated hours-by-weekday (replaces raw /daily-tasks fetch)
      this.db('daily_tasks')
        .where('is_deleted', false)
        .andWhereBetween('task_date', [monthStart, monthEnd])
        .groupBy(this.db.raw('DAYOFWEEK(task_date)'))
        .select(this.db.raw('DAYOFWEEK(task_date) as dow'))
        .sum({ hours: 'hours_spent' })
        .count({ tasks: '*' })
        .orderBy('dow', 'asc'),
      // Server-aggregated project × activity (replaces raw /daily-tasks fetch)
      this.db('daily_tasks')
        .leftJoin('projects', 'daily_tasks.project_id', 'projects.id')
        .leftJoin('activities', 'daily_tasks.activity_id', 'activities.id')
        .where('daily_tasks.is_deleted', false)
        .andWhere('daily_tasks.is_break', false)
        .andWhereBetween('daily_tasks.task_date', [monthStart, monthEnd])
        .whereNotNull('daily_tasks.project_id')
        .groupBy('projects.project_name', 'activities.activity_name')
        .select(
          'projects.project_name',
          this.db.raw("COALESCE(activities.activity_name, 'Other') as activity_name"),
        )
        .sum({ total_hours: 'hours_spent' })
        .count({ tasks: '*' }),
    ]);

    return {
      range: { from: monthStart, to: monthEnd },
      activity_distribution: activityDist,
      top_projects: topProjects,
      top_clients: topClients,
      top_employees: topEmployees,
      daily_trend: dailyTrend,
      hours_by_weekday: hoursByWeekday,
      project_activity: projectActivity,
    };
  }

  // ---- Yesterday's submission compliance (for the pie + counts)
  async yesterday() {
    const today = new Date().toISOString().slice(0, 10);
    const ydate = new Date(today + 'T00:00:00Z');
    ydate.setUTCDate(ydate.getUTCDate() - 1);
    const yesterday = ydate.toISOString().slice(0, 10);

    const [submittedRow, pendingRow] = await Promise.all([
      this.db('daily_tasks as dt')
        .innerJoin('employees', 'dt.employee_id', 'employees.id')
        .where('dt.is_deleted', false)
        .andWhere('dt.task_date', yesterday)
        .andWhere({ 'employees.role_id': 2, 'employees.is_active': true, 'employees.is_deleted': false })
        .countDistinct<{ c: number }[]>({ c: 'dt.employee_id' }).first(),
      this.db('employees')
        .where({ 'employees.is_active': true, 'employees.is_deleted': false, 'employees.role_id': 2 })
        .whereNotIn(
          'employees.id',
          this.db('daily_tasks').where({ is_deleted: false, task_date: yesterday }).whereNotNull('employee_id').select('employee_id'),
        )
        .count<{ c: number }[]>({ c: '*' }).first(),
    ]);

    return {
      date: yesterday,
      submitted: submittedRow?.c || 0,
      pending: pendingRow?.c || 0,
    };
  }

  async dashboard(params: { from?: string; to?: string; period?: string } = {}) {
    const today = new Date().toISOString().slice(0, 10);
    // Derive yesterday from today (UTC) so the two dates can never drift apart
    // across a DST/midnight boundary.
    const ydate = new Date(today + 'T00:00:00Z');
    ydate.setUTCDate(ydate.getUTCDate() - 1);
    const yesterday = ydate.toISOString().slice(0, 10);
    const range = resolveRange(params);
    const monthStart = range.from;
    const monthEnd = range.to;

    const trendStart = new Date(); trendStart.setDate(trendStart.getDate() - 29);
    const trendStartStr = trendStart.toISOString().slice(0, 10);

    const [
      activeEmployees,
      activeClients,
      activeProjects,
      todayTotals,
      monthTotals,
      pendingCount,
      activityDist,
      topProjects,
      dailyTrend,
      topClients,
      topEmployees,
      presentToday,
      todayClients,
      todayProjects,
      yesterdaySubmittedIds,
      yesterdayPendingList,
      hoursByWeekday,
      projectActivity,
    ] = await Promise.all([
      this.db('employees')
        .leftJoin('roles', 'employees.role_id', 'roles.id')
        .where({ 'employees.is_active': true, 'employees.is_deleted': false })
        .whereNot('roles.role_name', 'Admin')
        .count<{ c: number }[]>({ c: '*' }).first(),
      this.db('clients').where({ is_active: true, is_deleted: false }).count<{ c: number }[]>({ c: '*' }).first(),
      this.db('projects').where({ is_active: true, is_deleted: false, project_status: 'Active' }).count<{ c: number }[]>({ c: '*' }).first(),
      this.db('daily_tasks').where({ is_deleted: false, task_date: today }).sum({ hours: 'hours_spent' }).count({ tasks: '*' }).first(),
      this.db('daily_tasks').where('is_deleted', false).andWhereBetween('task_date', [monthStart, monthEnd]).sum({ hours: 'hours_spent' }).count({ tasks: '*' }).first(),
      // Pending submissions = active employees (role_id 2) who logged NO task today.
      this.db('employees')
        .where({ 'employees.is_active': true, 'employees.is_deleted': false, 'employees.role_id': 2 })
        .whereNotIn(
          'employees.id',
          this.db('daily_tasks').where({ is_deleted: false, task_date: today }).select('employee_id'),
        )
        .count<{ c: number }[]>({ c: '*' }).first(),
      this.db('daily_tasks')
        .leftJoin('activities', 'daily_tasks.activity_id', 'activities.id')
        .where('daily_tasks.is_deleted', false)
        .andWhere('daily_tasks.is_break', false)
        .andWhereBetween('daily_tasks.task_date', [monthStart, monthEnd])
        .groupBy('activities.activity_name')
        .select(this.db.raw("COALESCE(activities.activity_name, 'Other') as activity_name"))
        .sum({ total_hours: 'hours_spent' })
        .orderBy('total_hours', 'desc'),
      this.db('daily_tasks')
        .leftJoin('projects', 'daily_tasks.project_id', 'projects.id')
        .where('daily_tasks.is_deleted', false)
        .andWhere('daily_tasks.is_break', false)
        .andWhereBetween('daily_tasks.task_date', [monthStart, monthEnd])
        .whereNotNull('daily_tasks.project_id')
        .groupBy('projects.project_name')
        .select('projects.project_name')
        .sum({ total_hours: 'hours_spent' })
        .orderBy('total_hours', 'desc')
        .limit(5),
      this.db('daily_tasks')
        .where('is_deleted', false)
        .andWhere('task_date', '>=', trendStartStr)
        .groupBy('task_date')
        .select('task_date')
        .sum({ hours: 'hours_spent' })
        .count({ tasks: '*' })
        .orderBy('task_date', 'asc'),
      this.db('daily_tasks')
        .leftJoin('clients', 'daily_tasks.client_id', 'clients.id')
        .where('daily_tasks.is_deleted', false)
        .andWhere('daily_tasks.is_break', false)
        .andWhereBetween('daily_tasks.task_date', [monthStart, monthEnd])
        .whereNotNull('daily_tasks.client_id')
        .groupBy('clients.client_name')
        .select('clients.client_name')
        .sum({ total_hours: 'hours_spent' })
        .orderBy('total_hours', 'desc')
        .limit(5),
      this.db('daily_tasks')
        .leftJoin('employees', 'daily_tasks.employee_id', 'employees.id')
        .where('daily_tasks.is_deleted', false)
        .andWhereBetween('daily_tasks.task_date', [monthStart, monthEnd])
        .groupBy('employees.name')
        .select('employees.name')
        .sum({ total_hours: 'hours_spent' })
        .count({ tasks: '*' })
        .orderBy('total_hours', 'desc')
        .limit(5),
      // Present today: distinct employees with a Login event today (non-admins).
      // Includes earliest Login and latest Logout (if any) for the day.
      this.db('audit_logs as a')
        .innerJoin('employees', 'a.employee_id', 'employees.id')
        .leftJoin('roles', 'employees.role_id', 'roles.id')
        .leftJoin('departments', 'employees.department_id', 'departments.id')
        .whereRaw('DATE(a.created_at) = ?', [today])
        .andWhere({ 'employees.is_active': true, 'employees.is_deleted': false })
        .whereNot('roles.role_name', 'Admin')
        .whereExists(function () {
          this.select('*').from('audit_logs as a2')
            .whereRaw('a2.employee_id = a.employee_id')
            .andWhereRaw('DATE(a2.created_at) = ?', [today])
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
        ),
      // Clients those present-today employees are working on today (with hours).
      this.db('daily_tasks')
        .leftJoin('clients', 'daily_tasks.client_id', 'clients.id')
        .where('daily_tasks.is_deleted', false)
        .andWhere('daily_tasks.is_break', false)
        .andWhere('daily_tasks.task_date', today)
        .whereNotNull('daily_tasks.client_id')
        .whereIn(
          'daily_tasks.employee_id',
          this.db('audit_logs')
            .where('event_type', 'Login')
            .andWhereRaw('DATE(created_at) = ?', [today])
            .whereNotNull('employee_id')
            .distinct('employee_id'),
        )
        .groupBy('clients.client_name')
        .select('clients.client_name')
        .sum({ total_hours: 'hours_spent' })
        .count({ tasks: '*' })
        .orderBy('total_hours', 'desc'),
      // Projects those present-today employees are working on today (with hours).
      this.db('daily_tasks')
        .leftJoin('projects', 'daily_tasks.project_id', 'projects.id')
        .where('daily_tasks.is_deleted', false)
        .andWhere('daily_tasks.is_break', false)
        .andWhere('daily_tasks.task_date', today)
        .whereNotNull('daily_tasks.project_id')
        .whereIn(
          'daily_tasks.employee_id',
          this.db('audit_logs')
            .where('event_type', 'Login')
            .andWhereRaw('DATE(created_at) = ?', [today])
            .whereNotNull('employee_id')
            .distinct('employee_id'),
        )
        .groupBy('projects.project_name')
        .select('projects.project_name')
        .sum({ total_hours: 'hours_spent' })
        .count({ tasks: '*' })
        .orderBy('total_hours', 'desc'),
      // Yesterday's submitters — active Employee-role users who submitted at
      // least one daily_task for yesterday. (Denominator matches the pending
      // list below, so submitted + pending = total active Employees.)
      this.db('daily_tasks as dt')
        .innerJoin('employees', 'dt.employee_id', 'employees.id')
        .where('dt.is_deleted', false)
        .andWhere('dt.task_date', yesterday)
        .andWhere({ 'employees.role_id': 2, 'employees.is_active': true, 'employees.is_deleted': false })
        .distinct('dt.employee_id')
        .select('dt.employee_id'),
      // Yesterday's pending list — every active Employee-role user who did
      // NOT submit a DWR for yesterday, regardless of whether they logged in.
      this.db('employees')
        .leftJoin('departments', 'employees.department_id', 'departments.id')
        .where({
          'employees.is_active': true,
          'employees.is_deleted': false,
          'employees.role_id': 2,
        })
        .whereNotIn(
          'employees.id',
          this.db('daily_tasks')
            .where({ is_deleted: false, task_date: yesterday })
            .whereNotNull('employee_id')
            .select('employee_id'),
        )
        .select(
          'employees.id',
          'employees.name',
          'employees.email',
          'employees.employee_code',
          'departments.department_name',
        )
        .orderBy('employees.name', 'asc'),
      // Server-aggregated hours-by-weekday (replaces the raw /daily-tasks fetch
      // the dashboard used to chain just to bucket hours per weekday).
      this.db('daily_tasks')
        .where('is_deleted', false)
        .andWhereBetween('task_date', [monthStart, monthEnd])
        .groupBy(this.db.raw('DAYOFWEEK(task_date)'))
        .select(this.db.raw('DAYOFWEEK(task_date) as dow'))
        .sum({ hours: 'hours_spent' })
        .count({ tasks: '*' })
        .orderBy('dow', 'asc'),
      // Server-aggregated project × activity hours (replaces the same raw fetch
      // the dashboard used to chain for the project segmented bars).
      this.db('daily_tasks')
        .leftJoin('projects', 'daily_tasks.project_id', 'projects.id')
        .leftJoin('activities', 'daily_tasks.activity_id', 'activities.id')
        .where('daily_tasks.is_deleted', false)
        .andWhere('daily_tasks.is_break', false)
        .andWhereBetween('daily_tasks.task_date', [monthStart, monthEnd])
        .whereNotNull('daily_tasks.project_id')
        .groupBy('projects.project_name', 'activities.activity_name')
        .select(
          'projects.project_name',
          this.db.raw("COALESCE(activities.activity_name, 'Other') as activity_name"),
        )
        .sum({ total_hours: 'hours_spent' })
        .count({ tasks: '*' }),
    ]);

    const yesterdaySubmittedCount = (yesterdaySubmittedIds as any[]).filter((r) => r.employee_id != null).length;
    const yesterdayPendingCount = (yesterdayPendingList as any[]).length;

    return {
      counts: {
        active_employees: activeEmployees?.c || 0,
        active_clients: activeClients?.c || 0,
        active_projects: activeProjects?.c || 0,
        pending_submissions: pendingCount?.c || 0,
        present_today: (presentToday as any[]).length,
        yesterday_pending: yesterdayPendingCount,
        yesterday_submitted: yesterdaySubmittedCount,
      },
      today: todayTotals,
      this_month: monthTotals,
      activity_distribution: activityDist,
      top_projects: topProjects,
      top_clients: topClients,
      top_employees: topEmployees,
      daily_trend: dailyTrend,
      hours_by_weekday: hoursByWeekday,
      project_activity: projectActivity,
      range: { from: monthStart, to: monthEnd },
      present_today: presentToday,
      today_clients: todayClients,
      today_projects: todayProjects,
      yesterday: {
        date: yesterday,
        submitted: yesterdaySubmittedCount,
        pending: yesterdayPendingCount,
        pending_list: yesterdayPendingList,
      },
    };
  }
}

function resolveRange({ from, to, period }: { from?: string; to?: string; period?: string }) {
  if (from && to) return { from, to };
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  if (period === 'today') return { from: today, to: today };
  if (period === 'week') {
    const day = now.getDay();
    const monday = new Date(now); monday.setDate(now.getDate() - ((day + 6) % 7));
    return { from: monday.toISOString().slice(0, 10), to: today };
  }
  if (period === 'quarter') {
    const q = Math.floor(now.getMonth() / 3);
    const start = new Date(now.getFullYear(), q * 3, 1);
    return { from: start.toISOString().slice(0, 10), to: today };
  }
  if (period === 'year') {
    const start = new Date(now.getFullYear(), 0, 1);
    return { from: start.toISOString().slice(0, 10), to: today };
  }
  // default: month
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: start.toISOString().slice(0, 10), to: today };
}

@Controller('analytics')
@UseGuards(RolesGuard)
@Roles('Admin')
class AnalyticsController {
  constructor(private readonly s: AnalyticsService) {}
  @Get('dashboard')
  dashboard(@Query('period') period?: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.s.dashboard({ period, from, to });
  }
  @Get('summary')
  summary() { return this.s.summary(); }
  @Get('period')
  period(@Query('period') period?: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.s.period({ period, from, to });
  }
  @Get('yesterday')
  yesterday() { return this.s.yesterday(); }
}

@Module({ controllers: [AnalyticsController], providers: [AnalyticsService] })
export class AnalyticsModule {}






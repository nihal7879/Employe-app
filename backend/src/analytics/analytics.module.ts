import { Controller, Get, Inject, Injectable, Module, Query, UseGuards } from '@nestjs/common';
import { Knex } from 'knex';
import { KNEX_CONNECTION } from '../database/knex.module';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

@Injectable()
class AnalyticsService {
  constructor(@Inject(KNEX_CONNECTION) private readonly db: Knex) {}

  async dashboard(params: { from?: string; to?: string; period?: string } = {}) {
    const today = new Date().toISOString().slice(0, 10);
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
        .andWhereBetween('daily_tasks.task_date', [monthStart, monthEnd])
        .groupBy('activities.activity_name')
        .select('activities.activity_name')
        .sum({ total_hours: 'hours_spent' })
        .orderBy('total_hours', 'desc'),
      this.db('daily_tasks')
        .leftJoin('projects', 'daily_tasks.project_id', 'projects.id')
        .where('daily_tasks.is_deleted', false)
        .andWhereBetween('daily_tasks.task_date', [monthStart, monthEnd])
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
        .andWhereBetween('daily_tasks.task_date', [monthStart, monthEnd])
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
    ]);

    return {
      counts: {
        active_employees: activeEmployees?.c || 0,
        active_clients: activeClients?.c || 0,
        active_projects: activeProjects?.c || 0,
        pending_submissions: pendingCount?.c || 0,
      },
      today: todayTotals,
      this_month: monthTotals,
      activity_distribution: activityDist,
      top_projects: topProjects,
      top_clients: topClients,
      top_employees: topEmployees,
      daily_trend: dailyTrend,
      range: { from: monthStart, to: monthEnd },
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
}

@Module({ controllers: [AnalyticsController], providers: [AnalyticsService] })
export class AnalyticsModule {}

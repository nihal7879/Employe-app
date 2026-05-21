import { Controller, Get, Inject, Injectable, Module, Query, UseGuards } from '@nestjs/common';
import { Knex } from 'knex';
import { KNEX_CONNECTION } from '../database/knex.module';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

@Injectable()
class AnalyticsService {
  constructor(@Inject(KNEX_CONNECTION) private readonly db: Knex) {}

  async dashboard() {
    const today = new Date().toISOString().slice(0, 10);
    const monthStart = today.slice(0, 8) + '01';

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
      this.db('employees').where({ is_active: true, is_deleted: false }).count<{ c: number }[]>({ c: '*' }).first(),
      this.db('clients').where({ is_active: true, is_deleted: false }).count<{ c: number }[]>({ c: '*' }).first(),
      this.db('projects').where({ is_active: true, is_deleted: false, project_status: 'Active' }).count<{ c: number }[]>({ c: '*' }).first(),
      this.db('daily_tasks').where({ is_deleted: false, task_date: today }).sum({ hours: 'hours_spent' }).count({ tasks: '*' }).first(),
      this.db('daily_tasks').where('is_deleted', false).andWhere('task_date', '>=', monthStart).sum({ hours: 'hours_spent' }).count({ tasks: '*' }).first(),
      this.db('daily_tasks').where({ is_deleted: false, submission_status: 'Pending' }).count<{ c: number }[]>({ c: '*' }).first(),
      this.db('daily_tasks')
        .leftJoin('activities', 'daily_tasks.activity_id', 'activities.id')
        .where('daily_tasks.is_deleted', false)
        .andWhere('daily_tasks.task_date', '>=', monthStart)
        .groupBy('activities.activity_name')
        .select('activities.activity_name')
        .sum({ total_hours: 'hours_spent' })
        .orderBy('total_hours', 'desc'),
      this.db('daily_tasks')
        .leftJoin('projects', 'daily_tasks.project_id', 'projects.id')
        .where('daily_tasks.is_deleted', false)
        .andWhere('daily_tasks.task_date', '>=', monthStart)
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
        .andWhere('daily_tasks.task_date', '>=', monthStart)
        .groupBy('clients.client_name')
        .select('clients.client_name')
        .sum({ total_hours: 'hours_spent' })
        .orderBy('total_hours', 'desc')
        .limit(5),
      this.db('daily_tasks')
        .leftJoin('employees', 'daily_tasks.employee_id', 'employees.id')
        .where('daily_tasks.is_deleted', false)
        .andWhere('daily_tasks.task_date', '>=', monthStart)
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
    };
  }
}

@Controller('analytics')
@UseGuards(RolesGuard)
@Roles('Admin')
class AnalyticsController {
  constructor(private readonly s: AnalyticsService) {}
  @Get('dashboard') dashboard() { return this.s.dashboard(); }
}

@Module({ controllers: [AnalyticsController], providers: [AnalyticsService] })
export class AnalyticsModule {}

import { Inject, Injectable } from '@nestjs/common';
import { Knex } from 'knex';
import { KNEX_CONNECTION } from '../database/knex.module';
import { LOGGING_ROLE_NAMES } from '../common/constants';

type Range = { from: string; to: string };

@Injectable()
export class ReportsService {
  constructor(@Inject(KNEX_CONNECTION) private readonly db: Knex) {}

  // ---- Daily ----
  employeeDaily(date: string) {
    return this.db('daily_tasks')
      .leftJoin('employees', 'daily_tasks.employee_id', 'employees.id')
      .where('daily_tasks.is_deleted', false)
      .andWhere('daily_tasks.task_date', date)
      .groupBy('daily_tasks.employee_id', 'employees.name', 'employees.email')
      .select(
        'daily_tasks.employee_id',
        'employees.name as employee_name',
        'employees.email as employee_email',
        this.db.raw('SUM(hours_spent) as total_hours'),
        this.db.raw('COUNT(*) as task_count'),
      );
  }

  clientDaily(date: string) {
    return this.db('daily_tasks')
      .leftJoin('clients', 'daily_tasks.client_id', 'clients.id')
      .where('daily_tasks.is_deleted', false)
      .andWhere('daily_tasks.task_date', date)
      .groupBy('daily_tasks.client_id', 'clients.client_name')
      .select(
        'daily_tasks.client_id',
        'clients.client_name',
        this.db.raw('SUM(hours_spent) as total_hours'),
        this.db.raw('COUNT(*) as task_count'),
      );
  }

  projectDaily(date: string) {
    return this.db('daily_tasks')
      .leftJoin('projects', 'daily_tasks.project_id', 'projects.id')
      .where('daily_tasks.is_deleted', false)
      .andWhere('daily_tasks.task_date', date)
      .groupBy('daily_tasks.project_id', 'projects.project_name')
      .select(
        'daily_tasks.project_id',
        'projects.project_name',
        this.db.raw('SUM(hours_spent) as total_hours'),
        this.db.raw('COUNT(*) as task_count'),
      );
  }

  async pendingSubmissions(date: string) {
    // employees who did NOT submit on the given date
    const submittedEmpIds = await this.db('daily_tasks')
      .where('task_date', date)
      .andWhere('is_deleted', false)
      .distinct('employee_id')
      .pluck('employee_id');

    return this.db('employees')
      .leftJoin('departments', 'employees.department_id', 'departments.id')
      .where('employees.is_active', true)
      .andWhere('employees.is_deleted', false)
      // Employees + Managers — everyone who logs tasks; admins don't.
      .whereIn('employees.role_id', this.db('roles').whereIn('role_name', LOGGING_ROLE_NAMES).select('id'))
      .whereNotIn('employees.id', submittedEmpIds.length ? submittedEmpIds : [0])
      .select(
        'employees.id',
        'employees.name',
        'employees.email',
        'employees.employee_code',
        'departments.department_name',
      );
  }

  activityDaily(date: string) {
    return this.db('daily_tasks')
      .leftJoin('activities', 'daily_tasks.activity_id', 'activities.id')
      .where('daily_tasks.is_deleted', false)
      .andWhere('daily_tasks.task_date', date)
      .groupBy('daily_tasks.activity_id', 'activities.activity_name')
      .select(
        'daily_tasks.activity_id',
        'activities.activity_name',
        this.db.raw('SUM(hours_spent) as total_hours'),
        this.db.raw('COUNT(*) as task_count'),
      );
  }

  // ---- Range (weekly / monthly) ----
  private groupedByEmployee({ from, to }: Range) {
    return this.db('daily_tasks')
      .leftJoin('employees', 'daily_tasks.employee_id', 'employees.id')
      .where('daily_tasks.is_deleted', false)
      .andWhereBetween('daily_tasks.task_date', [from, to])
      .groupBy('daily_tasks.employee_id', 'employees.name', 'employees.email')
      .select(
        'daily_tasks.employee_id',
        'employees.name as employee_name',
        'employees.email as employee_email',
        this.db.raw('SUM(hours_spent) as total_hours'),
        this.db.raw('COUNT(*) as task_count'),
      );
  }

  private groupedByClient({ from, to }: Range) {
    return this.db('daily_tasks')
      .leftJoin('clients', 'daily_tasks.client_id', 'clients.id')
      .where('daily_tasks.is_deleted', false)
      .andWhereBetween('daily_tasks.task_date', [from, to])
      .groupBy('daily_tasks.client_id', 'clients.client_name')
      .select(
        'daily_tasks.client_id',
        'clients.client_name',
        this.db.raw('SUM(hours_spent) as total_hours'),
        this.db.raw('COUNT(*) as task_count'),
      );
  }

  private groupedByProject({ from, to }: Range) {
    return this.db('daily_tasks')
      .leftJoin('projects', 'daily_tasks.project_id', 'projects.id')
      .where('daily_tasks.is_deleted', false)
      .andWhereBetween('daily_tasks.task_date', [from, to])
      .groupBy('daily_tasks.project_id', 'projects.project_name')
      .select(
        'daily_tasks.project_id',
        'projects.project_name',
        this.db.raw('SUM(hours_spent) as total_hours'),
        this.db.raw('COUNT(*) as task_count'),
      );
  }

  private groupedByActivity({ from, to }: Range) {
    return this.db('daily_tasks')
      .leftJoin('activities', 'daily_tasks.activity_id', 'activities.id')
      .where('daily_tasks.is_deleted', false)
      .andWhereBetween('daily_tasks.task_date', [from, to])
      .groupBy('daily_tasks.activity_id', 'activities.activity_name')
      .select(
        'daily_tasks.activity_id',
        'activities.activity_name',
        this.db.raw('SUM(hours_spent) as total_hours'),
        this.db.raw('COUNT(*) as task_count'),
      );
  }

  private groupedByAssignedBy({ from, to }: Range) {
    return this.db('daily_tasks')
      .where('daily_tasks.is_deleted', false)
      .andWhereBetween('daily_tasks.task_date', [from, to])
      .groupBy('daily_tasks.assigned_by')
      .select(
        'daily_tasks.assigned_by',
        this.db.raw('SUM(hours_spent) as total_hours'),
        this.db.raw('COUNT(*) as task_count'),
      )
      .orderBy('total_hours', 'desc');
  }

  weekly(range: Range) {
    return Promise.all([
      this.groupedByEmployee(range),
      this.groupedByClient(range),
      this.groupedByProject(range),
      this.groupedByActivity(range),
      this.groupedByAssignedBy(range),
    ]).then(([employees, clients, projects, activities, assigned]) => ({
      range,
      employees,
      clients,
      projects,
      activities,
      assigned,
    }));
  }

  monthly(range: Range) {
    return this.weekly(range);
  }
}

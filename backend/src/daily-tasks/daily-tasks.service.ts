import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Knex } from 'knex';
import { KNEX_CONNECTION } from '../database/knex.module';
import { CreateDailyTaskDto, ListDailyTasksDto, UpdateDailyTaskDto } from './dto/daily-task.dto';

@Injectable()
export class DailyTasksService {
  constructor(@Inject(KNEX_CONNECTION) private readonly db: Knex) {}

  private base() {
    return this.db('daily_tasks')
      .leftJoin('employees', 'daily_tasks.employee_id', 'employees.id')
      .leftJoin('departments', 'employees.department_id', 'departments.id')
      .leftJoin('clients', 'daily_tasks.client_id', 'clients.id')
      .leftJoin('projects', 'daily_tasks.project_id', 'projects.id')
      .leftJoin('activities', 'daily_tasks.activity_id', 'activities.id')
      .where('daily_tasks.is_deleted', false)
      .select(
        'daily_tasks.*',
        'employees.name as employee_name',
        'employees.email as employee_email',
        'employees.employee_code as employee_code',
        'departments.department_name as department_name',
        'clients.client_name as client_name',
        'projects.project_name as project_name',
        'projects.project_code as project_code',
        'activities.activity_name as activity_name',
      );
  }

  async list(q: ListDailyTasksDto, scope?: { employee_id?: number }) {
    let qb = this.base();
    const empId = scope?.employee_id ?? q.employee_id;
    if (empId) qb = qb.where('daily_tasks.employee_id', empId);
    if (q.client_id) qb = qb.where('daily_tasks.client_id', q.client_id);
    if (q.project_id) qb = qb.where('daily_tasks.project_id', q.project_id);
    if (q.activity_id) qb = qb.where('daily_tasks.activity_id', q.activity_id);
    if (q.submission_status) qb = qb.where('daily_tasks.submission_status', q.submission_status);
    if (q.from) qb = qb.where('daily_tasks.task_date', '>=', q.from);
    if (q.to) qb = qb.where('daily_tasks.task_date', '<=', q.to);
    return qb.orderBy('daily_tasks.task_date', 'desc').orderBy('daily_tasks.created_at', 'desc');
  }

  async findOne(id: number) {
    const row = await this.base().andWhere('daily_tasks.id', id).first();
    if (!row) throw new NotFoundException('Daily task not found');
    return row;
  }

  async create(employee_id: number, ip: string, dto: CreateDailyTaskDto) {
    const payload = {
      employee_id,
      ip_address: ip,
      submission_status: dto.submission_status || 'Submitted',
      ...dto,
    };
    const [id] = await this.db('daily_tasks').insert(payload);
    return this.findOne(id);
  }

  async update(id: number, user: { id: number; role: string }, dto: UpdateDailyTaskDto) {
    const existing = await this.findOne(id);
    if (user.role !== 'Admin' && existing.employee_id !== user.id) {
      throw new ForbiddenException('Cannot edit another employee\'s task');
    }
    await this.db('daily_tasks').where({ id }).update(dto);
    return this.findOne(id);
  }

  async remove(id: number, user: { id: number; role: string }) {
    const existing = await this.findOne(id);
    if (user.role !== 'Admin' && existing.employee_id !== user.id) {
      throw new ForbiddenException('Cannot delete another employee\'s task');
    }
    await this.db('daily_tasks').where({ id }).update({ is_deleted: true, is_active: false });
    return { success: true };
  }

  // ------- Helpers used by reports & scheduler -------

  async getEmployeeReport(employee_id: number, date: string) {
    const rows = await this.base()
      .andWhere('daily_tasks.employee_id', employee_id)
      .andWhere('daily_tasks.task_date', date);
    const total_hours = rows.reduce((sum, r) => sum + Number(r.hours_spent || 0), 0);
    return { date, total_hours, tasks: rows };
  }

  async getEmployeeRangeReport(employee_id: number, from: string, to: string) {
    const rows = await this.base()
      .andWhere('daily_tasks.employee_id', employee_id)
      .andWhereBetween('daily_tasks.task_date', [from, to]);
    const total_hours = rows.reduce((sum, r) => sum + Number(r.hours_spent || 0), 0);
    return { from, to, total_hours, tasks: rows };
  }
}

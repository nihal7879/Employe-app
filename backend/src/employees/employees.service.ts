import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Knex } from 'knex';
import { KNEX_CONNECTION } from '../database/knex.module';
import { CreateEmployeeDto, UpdateEmployeeDto, UpdatePermissionsDto } from './dto/employee.dto';

@Injectable()
export class EmployeesService {
  constructor(@Inject(KNEX_CONNECTION) private readonly db: Knex) {}

  private baseSelect() {
    return this.db('employees')
      .leftJoin('roles', 'employees.role_id', 'roles.id')
      .leftJoin('departments', 'employees.department_id', 'departments.id')
      .where('employees.is_deleted', false)
      .select(
        'employees.*',
        'roles.role_name as role_name',
        'departments.department_name as department_name',
      );
  }

  async findAll(query: { search?: string; department_id?: number; role_id?: number; include_admin?: string | boolean }) {
    let q = this.baseSelect();
    if (query.search) {
      q = q.where((b) =>
        b
          .where('employees.name', 'like', `%${query.search}%`)
          .orWhere('employees.email', 'like', `%${query.search}%`)
          .orWhere('employees.employee_code', 'like', `%${query.search}%`),
      );
    }
    if (query.department_id) q = q.where('employees.department_id', query.department_id);
    if (query.role_id) q = q.where('employees.role_id', query.role_id);
    const includeAdmin = query.include_admin === true || query.include_admin === 'true';
    if (!includeAdmin) q = q.whereNot('roles.role_name', 'Admin');
    return q.orderBy('employees.created_at', 'desc');
  }

  async findOne(id: number) {
    const row = await this.baseSelect().andWhere('employees.id', id).first();
    if (!row) throw new NotFoundException('Employee not found');
    return row;
  }

  async create(dto: CreateEmployeeDto) {
    const [id] = await this.db('employees').insert(dto);
    return this.findOne(id);
  }

  async update(id: number, dto: UpdateEmployeeDto) {
    await this.db('employees').where({ id }).update(dto);
    return this.findOne(id);
  }

  async remove(id: number) {
    await this.db('employees').where({ id }).update({ is_deleted: true, is_active: false });
    return { success: true };
  }

  // Toggle the per-employee task-logging permissions (admin only). Only the
  // flags present in the payload are written.
  async setPermissions(id: number, dto: UpdatePermissionsDto) {
    const patch: Record<string, unknown> = {};
    if (dto.allow_backdated_tasks !== undefined) {
      patch.allow_backdated_tasks = dto.allow_backdated_tasks;
      // Turning it OFF clears any expiry so a later re-grant starts clean.
      if (!dto.allow_backdated_tasks) patch.allow_backdated_until = null;
    }
    if (dto.allow_log_anytime !== undefined) {
      patch.allow_log_anytime = dto.allow_log_anytime;
      if (!dto.allow_log_anytime) patch.allow_log_anytime_until = null;
    }
    // Expiry: a string sets it, null clears it (permanent). Undefined = leave as is.
    if (dto.allow_backdated_until !== undefined) {
      patch.allow_backdated_until = dto.allow_backdated_until ? new Date(dto.allow_backdated_until) : null;
    }
    if (dto.allow_log_anytime_until !== undefined) {
      patch.allow_log_anytime_until = dto.allow_log_anytime_until ? new Date(dto.allow_log_anytime_until) : null;
    }
    if (Object.keys(patch).length) await this.db('employees').where({ id }).update(patch);
    return this.findOne(id);
  }
}

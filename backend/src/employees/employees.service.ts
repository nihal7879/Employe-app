import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Knex } from 'knex';
import { KNEX_CONNECTION } from '../database/knex.module';
import { CreateEmployeeDto, UpdateEmployeeDto } from './dto/employee.dto';

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

  async findAll(query: { search?: string; department_id?: number; role_id?: number }) {
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
}

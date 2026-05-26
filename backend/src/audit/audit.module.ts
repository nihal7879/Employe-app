import { Controller, Get, Inject, Injectable, Module, Query, UseGuards } from '@nestjs/common';
import { Knex } from 'knex';
import { KNEX_CONNECTION } from '../database/knex.module';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

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
@Roles('Admin')
class AuditController {
  constructor(private readonly s: AuditService) {}

  @Get('logs')
  list(@Query() q: { employee_id?: string; event_type?: string; from?: string; to?: string; limit?: string }) {
    return this.s.list(q);
  }

  @Get('login-counts')
  counts(@Query() q: { from?: string; to?: string }) {
    return this.s.loginCounts(q);
  }
}

@Module({ controllers: [AuditController], providers: [AuditService] })
export class AuditModule {}

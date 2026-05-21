import { Controller, Get, Inject, Injectable, Module, Query, UseGuards } from '@nestjs/common';
import { Knex } from 'knex';
import { KNEX_CONNECTION } from '../database/knex.module';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

@Injectable()
class EmailLogsService {
  constructor(@Inject(KNEX_CONNECTION) private readonly db: Knex) {}
  list(params: { status?: string; email_type?: string; limit?: number }) {
    let q = this.db('email_logs').orderBy('created_at', 'desc');
    if (params.status) q = q.where('status', params.status);
    if (params.email_type) q = q.where('email_type', params.email_type);
    return q.limit(Number(params.limit || 200));
  }
}

@Controller('email-logs')
@UseGuards(RolesGuard)
@Roles('Admin')
class EmailLogsController {
  constructor(private readonly s: EmailLogsService) {}
  @Get()
  list(@Query('status') status?: string, @Query('email_type') email_type?: string, @Query('limit') limit?: number) {
    return this.s.list({ status, email_type, limit });
  }
}

@Module({ controllers: [EmailLogsController], providers: [EmailLogsService] })
export class EmailLogsModule {}

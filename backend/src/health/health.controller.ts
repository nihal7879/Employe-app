import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Knex } from 'knex';
import { Public } from '../common/decorators/public.decorator';
import { KNEX_CONNECTION } from '../database/knex.module';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@Inject(KNEX_CONNECTION) private readonly db: Knex) {}

  /** Public smoke test: confirms the app booted and the DB is reachable. */
  @Public()
  @Get()
  async check() {
    let db = 'up';
    let dbError: string | undefined;
    try {
      await this.db.raw('SELECT 1');
    } catch (e: any) {
      db = 'down';
      dbError = e?.message ?? 'unknown error';
    }
    return {
      status: db === 'up' ? 'ok' : 'degraded',
      db,
      ...(dbError ? { dbError } : {}),
      time: new Date().toISOString(),
    };
  }
}

import { Body, Controller, Delete, Get, Inject, Injectable, Module, Param, ParseIntPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';
import { Knex } from 'knex';
import { KNEX_CONNECTION } from '../database/knex.module';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { NotificationsModule, NotificationsService } from '../notifications/notifications.module';

class HolidayDto {
  @IsDateString() holiday_date: string;
  @IsString() @MaxLength(200) name: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
}

@Injectable()
export class HolidaysService {
  constructor(
    @Inject(KNEX_CONNECTION) private readonly db: Knex,
    private readonly notifications: NotificationsService,
  ) {}

  private base() {
    return this.db('holidays').where('is_deleted', false);
  }

  // All holidays, most recent first; optionally within a [from, to] range.
  findAll(from?: string, to?: string) {
    let q = this.base();
    if (from) q = q.andWhere('holiday_date', '>=', from);
    if (to) q = q.andWhere('holiday_date', '<=', to);
    return q.orderBy('holiday_date', 'desc');
  }

  // Today + the next few upcoming holidays (for the dashboard card).
  upcoming(limit = 5) {
    const today = new Date().toISOString().slice(0, 10);
    return this.base().andWhere('holiday_date', '>=', today).orderBy('holiday_date', 'asc').limit(limit);
  }

  // The holiday on a given date, if any (used for the "today is a holiday" banner).
  onDate(date: string) {
    return this.base().andWhere('holiday_date', date).first();
  }

  findOne(id: number) {
    return this.base().andWhere('id', id).first();
  }

  async create(dto: HolidayDto) {
    const date = dto.holiday_date.slice(0, 10);
    const [id] = await this.db('holidays').insert({
      holiday_date: date,
      name: dto.name,
      description: dto.description ?? null,
    });
    // Announce the holiday to every active employee (bell feed).
    await this.notifyEmployees(date, dto.name, dto.description);
    return this.findOne(id);
  }

  // Drop a "Holiday" notification on every active employee's feed.
  private async notifyEmployees(date: string, name: string, description?: string) {
    const pretty = new Date(date + 'T00:00:00').toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
    const rows = await this.db('employees')
      .where({ is_active: true, is_deleted: false })
      .pluck('id');
    await this.notifications.createMany(rows, {
      type: 'Holiday',
      title: `Holiday: ${name}`,
      body: description ? `${pretty} — ${description}` : pretty,
      link: '/',
    });
  }

  async update(id: number, dto: Partial<HolidayDto>) {
    const patch: Record<string, unknown> = {};
    if (dto.holiday_date !== undefined) patch.holiday_date = String(dto.holiday_date).slice(0, 10);
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.description !== undefined) patch.description = dto.description ?? null;
    if (Object.keys(patch).length) await this.db('holidays').where({ id }).update(patch);
    return this.findOne(id);
  }

  remove(id: number) {
    return this.db('holidays').where({ id }).update({ is_deleted: true });
  }

  // True if the given YYYY-MM-DD is a (non-deleted) holiday. Used by the
  // scheduler to skip submission reminders / daily reports on holidays.
  async isHoliday(date: string): Promise<boolean> {
    const row = await this.base().andWhere('holiday_date', date).first('id');
    return !!row;
  }
}

@Controller('holidays')
@UseGuards(RolesGuard)
class HolidaysController {
  constructor(private readonly s: HolidaysService) {}

  // Any authenticated user may read the calendar.
  @Get() list(@Query('from') from?: string, @Query('to') to?: string) { return this.s.findAll(from, to); }
  @Get('upcoming') upcoming(@Query('limit') limit?: string) { return this.s.upcoming(limit ? Number(limit) : 5); }
  @Get('today') today() { return this.s.onDate(new Date().toISOString().slice(0, 10)); }
  @Get(':id') one(@Param('id', ParseIntPipe) id: number) { return this.s.findOne(id); }

  @Post() @Roles('Admin') create(@Body() dto: HolidayDto) { return this.s.create(dto); }
  @Put(':id') @Roles('Admin') update(@Param('id', ParseIntPipe) id: number, @Body() dto: Partial<HolidayDto>) { return this.s.update(id, dto); }
  @Delete(':id') @Roles('Admin') remove(@Param('id', ParseIntPipe) id: number) { return this.s.remove(id); }
}

@Module({ imports: [NotificationsModule], controllers: [HolidaysController], providers: [HolidaysService], exports: [HolidaysService] })
export class HolidaysModule {}

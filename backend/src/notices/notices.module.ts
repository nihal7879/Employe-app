import { Body, Controller, Delete, Get, Inject, Injectable, Module, Param, ParseIntPipe, Post, Put, UseGuards } from '@nestjs/common';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Knex } from 'knex';
import { KNEX_CONNECTION } from '../database/knex.module';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

const COLORS = ['red', 'amber', 'blue', 'green', 'slate'];

class NoticeDto {
  @IsString() @MinLength(1) @MaxLength(500) message: string;
  @IsOptional() @IsIn(COLORS) color?: string;
  @IsOptional() @IsBoolean() is_active?: boolean;
}

// Dashboard notices — a scalable list (replaces the old single-string config
// notice). Employees see active notices in the dashboard ticker; admins manage
// the full history (add, edit, activate/deactivate, delete).
@Injectable()
export class NoticesService {
  constructor(@Inject(KNEX_CONNECTION) private readonly db: Knex) {}

  private base() {
    return this.db('notices').where('is_deleted', false);
  }

  // All notices (active + inactive), newest first — for the admin manager.
  findAll() {
    return this.base().orderBy('created_at', 'desc');
  }

  // Active notices only, newest first — for the employee ticker.
  active() {
    return this.base().andWhere('is_active', true).orderBy('created_at', 'desc');
  }

  findOne(id: number) {
    return this.base().andWhere('id', id).first();
  }

  async create(dto: NoticeDto) {
    const [id] = await this.db('notices').insert({
      message: dto.message,
      color: dto.color ?? 'red',
      is_active: dto.is_active ?? true,
    });
    return this.findOne(id);
  }

  async update(id: number, dto: Partial<NoticeDto>) {
    const patch: Record<string, unknown> = {};
    if (dto.message !== undefined) patch.message = dto.message;
    if (dto.color !== undefined) patch.color = dto.color;
    if (dto.is_active !== undefined) patch.is_active = dto.is_active;
    if (Object.keys(patch).length) await this.db('notices').where({ id }).update(patch);
    return this.findOne(id);
  }

  remove(id: number) {
    return this.db('notices').where({ id }).update({ is_deleted: true });
  }
}

@Controller('notices')
@UseGuards(RolesGuard)
class NoticesController {
  constructor(private readonly s: NoticesService) {}

  // Any authenticated user reads active notices (dashboard ticker).
  @Get('active') active() { return this.s.active(); }

  // Admin-only management.
  @Get() @Roles('Admin') list() { return this.s.findAll(); }
  @Post() @Roles('Admin') create(@Body() dto: NoticeDto) { return this.s.create(dto); }
  @Put(':id') @Roles('Admin') update(@Param('id', ParseIntPipe) id: number, @Body() dto: Partial<NoticeDto>) { return this.s.update(id, dto); }
  @Delete(':id') @Roles('Admin') remove(@Param('id', ParseIntPipe) id: number) { return this.s.remove(id); }
}

@Module({ controllers: [NoticesController], providers: [NoticesService], exports: [NoticesService] })
export class NoticesModule {}

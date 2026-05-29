import { Body, Controller, Delete, Get, Inject, Injectable, Module, Param, ParseIntPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { IsBoolean, IsDateString, IsInt, IsOptional, IsString } from 'class-validator';
import { Knex } from 'knex';
import { KNEX_CONNECTION } from '../database/knex.module';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

class ProjectDto {
  @IsInt() client_id: number;
  // project_code is required at the DB level but auto-generated server-side
  // when omitted (see ProjectsService.create). Kept optional in the DTO so
  // the admin form doesn't have to collect it.
  @IsOptional() @IsString() project_code?: string;
  @IsString() project_name: string;
  @IsOptional() @IsDateString() start_date?: string;
  @IsOptional() @IsDateString() end_date?: string;
  @IsOptional() @IsString() project_status?: string;
  @IsOptional() @IsBoolean() is_active?: boolean;
}

@Injectable()
class ProjectsService {
  constructor(@Inject(KNEX_CONNECTION) private readonly db: Knex) {}
  private base() {
    return this.db('projects')
      .leftJoin('clients', 'projects.client_id', 'clients.id')
      .where('projects.is_deleted', false)
      .select('projects.*', 'clients.client_name as client_name');
  }
  findAll(client_id?: number) {
    let q = this.base();
    if (client_id) q = q.where('projects.client_id', client_id);
    return q.orderBy('projects.created_at', 'desc');
  }
  findOne(id: number) {
    return this.base().andWhere('projects.id', id).first();
  }
  async create(dto: ProjectDto) {
    const payload: Record<string, unknown> = { ...dto };
    if (!payload.project_code || !String(payload.project_code).trim()) {
      payload.project_code = await this.makeUniqueCode(dto.project_name);
    }
    const [id] = await this.db('projects').insert(payload);
    return this.findOne(id);
  }

  // Auto-generate a unique project_code from the name when the admin form
  // omits it. Slug the name, upper-case it, and append a numeric suffix only
  // if a row with that code already exists.
  private async makeUniqueCode(name: string): Promise<string> {
    const base = (name || 'PROJECT')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 28) || 'PROJECT';
    let code = base;
    let n = 1;
    while (await this.db('projects').where('project_code', code).first()) {
      n += 1;
      code = `${base}-${n}`.slice(0, 32);
    }
    return code;
  }
  async update(id: number, dto: Partial<ProjectDto>) {
    await this.db('projects').where({ id }).update(dto);
    return this.findOne(id);
  }
  remove(id: number) {
    return this.db('projects').where({ id }).update({ is_deleted: true, is_active: false });
  }
}

@Controller('projects')
@UseGuards(RolesGuard)
class ProjectsController {
  constructor(private readonly s: ProjectsService) {}
  @Get() list(@Query('client_id') client_id?: number) { return this.s.findAll(client_id); }
  @Get(':id') one(@Param('id', ParseIntPipe) id: number) { return this.s.findOne(id); }
  @Post() @Roles('Admin') create(@Body() dto: ProjectDto) { return this.s.create(dto); }
  @Put(':id') @Roles('Admin') update(@Param('id', ParseIntPipe) id: number, @Body() dto: Partial<ProjectDto>) { return this.s.update(id, dto); }
  @Delete(':id') @Roles('Admin') remove(@Param('id', ParseIntPipe) id: number) { return this.s.remove(id); }
}

@Module({ controllers: [ProjectsController], providers: [ProjectsService] })
export class ProjectsModule {}








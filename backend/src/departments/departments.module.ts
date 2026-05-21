import { Body, Controller, Delete, Get, Inject, Injectable, Module, Param, ParseIntPipe, Post, Put, UseGuards } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { Knex } from 'knex';
import { KNEX_CONNECTION } from '../database/knex.module';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

class DepartmentDto {
  @IsString() @MaxLength(100) department_name: string;
  @IsOptional() @IsBoolean() is_active?: boolean;
}

@Injectable()
class DepartmentsService {
  constructor(@Inject(KNEX_CONNECTION) private readonly db: Knex) {}
  findAll() {
    return this.db('departments').where('is_deleted', false).orderBy('department_name');
  }
  findOne(id: number) {
    return this.db('departments').where({ id, is_deleted: false }).first();
  }
  async create(dto: DepartmentDto) {
    const [id] = await this.db('departments').insert(dto);
    return this.findOne(id);
  }
  async update(id: number, dto: Partial<DepartmentDto>) {
    await this.db('departments').where({ id }).update(dto);
    return this.findOne(id);
  }
  remove(id: number) {
    return this.db('departments').where({ id }).update({ is_deleted: true, is_active: false });
  }
}

@Controller('departments')
@UseGuards(RolesGuard)
class DepartmentsController {
  constructor(private readonly s: DepartmentsService) {}
  @Get() list() { return this.s.findAll(); }
  @Get(':id') one(@Param('id', ParseIntPipe) id: number) { return this.s.findOne(id); }
  @Post() @Roles('Admin') create(@Body() dto: DepartmentDto) { return this.s.create(dto); }
  @Put(':id') @Roles('Admin') update(@Param('id', ParseIntPipe) id: number, @Body() dto: Partial<DepartmentDto>) { return this.s.update(id, dto); }
  @Delete(':id') @Roles('Admin') remove(@Param('id', ParseIntPipe) id: number) { return this.s.remove(id); }
}

@Module({ controllers: [DepartmentsController], providers: [DepartmentsService] })
export class DepartmentsModule {}

import { Body, Controller, Delete, Get, Inject, Injectable, Module, Param, ParseIntPipe, Post, Put, UseGuards } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { Knex } from 'knex';
import { KNEX_CONNECTION } from '../database/knex.module';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

class ActivityDto {
  @IsString() @MaxLength(100) activity_name: string;
  @IsOptional() @IsBoolean() is_active?: boolean;
}

@Injectable()
class ActivitiesService {
  constructor(@Inject(KNEX_CONNECTION) private readonly db: Knex) {}
  findAll() {
    return this.db('activities').where('is_deleted', false).orderBy('activity_name');
  }
  findOne(id: number) {
    return this.db('activities').where({ id, is_deleted: false }).first();
  }
  async create(dto: ActivityDto) {
    const [id] = await this.db('activities').insert(dto);
    return this.findOne(id);
  }
  async update(id: number, dto: Partial<ActivityDto>) {
    await this.db('activities').where({ id }).update(dto);
    return this.findOne(id);
  }
  remove(id: number) {
    return this.db('activities').where({ id }).update({ is_deleted: true, is_active: false });
  }
}

@Controller('activities')
@UseGuards(RolesGuard)
class ActivitiesController {
  constructor(private readonly s: ActivitiesService) {}
  @Get() list() { return this.s.findAll(); }
  @Get(':id') one(@Param('id', ParseIntPipe) id: number) { return this.s.findOne(id); }
  @Post() @Roles('Admin') create(@Body() dto: ActivityDto) { return this.s.create(dto); }
  @Put(':id') @Roles('Admin') update(@Param('id', ParseIntPipe) id: number, @Body() dto: Partial<ActivityDto>) { return this.s.update(id, dto); }
  @Delete(':id') @Roles('Admin') remove(@Param('id', ParseIntPipe) id: number) { return this.s.remove(id); }
}

@Module({ controllers: [ActivitiesController], providers: [ActivitiesService] })
export class ActivitiesModule {}

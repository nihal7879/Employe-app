import { Body, Controller, Delete, Get, Inject, Injectable, Module, Param, ParseIntPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { Knex } from 'knex';
import { KNEX_CONNECTION } from '../database/knex.module';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

class ClientDto {
  @IsString() @MaxLength(255) client_name: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsBoolean() is_active?: boolean;
}

@Injectable()
class ClientsService {
  constructor(@Inject(KNEX_CONNECTION) private readonly db: Knex) {}
  findAll(search?: string) {
    let q = this.db('clients').where('is_deleted', false);
    if (search) q = q.andWhere('client_name', 'like', `%${search}%`);
    return q.orderBy('client_name');
  }
  findOne(id: number) {
    return this.db('clients').where({ id, is_deleted: false }).first();
  }
  async create(dto: ClientDto) {
    const [id] = await this.db('clients').insert(dto);
    return this.findOne(id);
  }
  async update(id: number, dto: Partial<ClientDto>) {
    await this.db('clients').where({ id }).update(dto);
    return this.findOne(id);
  }
  remove(id: number) {
    return this.db('clients').where({ id }).update({ is_deleted: true, is_active: false });
  }
}

@Controller('clients')
@UseGuards(RolesGuard)
class ClientsController {
  constructor(private readonly s: ClientsService) {}
  @Get() list(@Query('search') search?: string) { return this.s.findAll(search); }
  @Get(':id') one(@Param('id', ParseIntPipe) id: number) { return this.s.findOne(id); }
  @Post() @Roles('Admin') create(@Body() dto: ClientDto) { return this.s.create(dto); }
  @Put(':id') @Roles('Admin') update(@Param('id', ParseIntPipe) id: number, @Body() dto: Partial<ClientDto>) { return this.s.update(id, dto); }
  @Delete(':id') @Roles('Admin') remove(@Param('id', ParseIntPipe) id: number) { return this.s.remove(id); }
}

@Module({ controllers: [ClientsController], providers: [ClientsService] })
export class ClientsModule {}














































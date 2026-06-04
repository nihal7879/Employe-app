import { Controller, Get, Inject, Injectable, Module } from '@nestjs/common';
import { Knex } from 'knex';
import { KNEX_CONNECTION } from '../database/knex.module';

@Injectable()
class RolesService {
  constructor(@Inject(KNEX_CONNECTION) private readonly db: Knex) {}
  findAll() {
    return this.db('roles').where('is_deleted', false).orderBy('role_name');
  }
}

@Controller('roles')
class RolesController {
  constructor(private readonly s: RolesService) {}
  @Get() list() { return this.s.findAll(); }
}

@Module({ controllers: [RolesController], providers: [RolesService] })
export class RolesModule {}
















































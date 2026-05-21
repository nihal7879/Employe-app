import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import knex, { Knex } from 'knex';

export const KNEX_CONNECTION = 'KNEX_CONNECTION';

@Global()
@Module({
  providers: [
    {
      provide: KNEX_CONNECTION,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Knex => {
        return knex({
          client: 'mysql2',
          connection: {
            host: config.get<string>('DB_HOST', '127.0.0.1'),
            port: config.get<number>('DB_PORT', 3306),
            user: config.get<string>('DB_USER', 'root'),
            password: config.get<string>('DB_PASSWORD', ''),
            database: config.get<string>('DB_NAME', 'employee_app'),
            dateStrings: true,
          },
          pool: { min: 2, max: 10 },
        });
      },
    },
  ],
  exports: [KNEX_CONNECTION],
})
export class KnexModule {}

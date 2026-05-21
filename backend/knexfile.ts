import 'dotenv/config';
import type { Knex } from 'knex';

const config: { [key: string]: Knex.Config } = {
  development: {
    client: 'mysql2',
    connection: {
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'employee_app',
      dateStrings: true,
    },
    pool: { min: 2, max: 10 },
    migrations: { directory: './src/database/migrations', extension: 'ts' },
    seeds: { directory: './src/database/seeds', extension: 'ts' },
  },
  production: {
    client: 'mysql2',
    connection: {
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      dateStrings: true,
    },
    pool: { min: 2, max: 20 },
    migrations: { directory: './dist/database/migrations' },
  },
};

export default config;

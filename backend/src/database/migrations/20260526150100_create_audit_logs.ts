import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable('audit_logs')) return;
  await knex.schema.createTable('audit_logs', (t) => {
    t.increments('id').primary();
    t.integer('employee_id').unsigned().nullable();
    t.string('employee_email', 191).nullable();
    t.string('event_type', 16).notNullable(); // 'Login' | 'Logout'
    t.string('ip', 45).nullable();
    t.string('gps', 128).nullable();
    t.string('device', 64).nullable();
    t.string('browser', 64).nullable();
    t.string('user_agent', 512).nullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.index(['employee_id', 'event_type']);
    t.index(['created_at']);
    t.foreign('employee_id').references('id').inTable('employees').onDelete('SET NULL');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('audit_logs');
}

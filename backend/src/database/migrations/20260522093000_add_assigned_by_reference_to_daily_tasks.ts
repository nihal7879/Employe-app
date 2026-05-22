import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('daily_tasks', (t) => {
    t.string('assigned_by', 255).nullable().after('task_title');
    t.string('reference', 255).nullable().after('assigned_by');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('daily_tasks', (t) => {
    t.dropColumn('assigned_by');
    t.dropColumn('reference');
  });
}

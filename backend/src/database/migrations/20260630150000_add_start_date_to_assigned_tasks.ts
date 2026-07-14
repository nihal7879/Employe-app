import type { Knex } from 'knex';

// A task's planned start date (when work should begin), separate from
// assigned_date (when it was handed out) and due_date (deadline).
export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn('assigned_tasks', 'start_date')) return;
  await knex.schema.alterTable('assigned_tasks', (t) => {
    t.date('start_date').nullable().after('assigned_date');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('assigned_tasks', (t) => {
    t.dropColumn('start_date');
  });
}

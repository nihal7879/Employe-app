import type { Knex } from 'knex';

// When the assignee first opened the task. NULL means "new to me" — that's what
// drives the highlight on the dashboard. Stored on the row (not client-side) so
// it survives a logout/login, and reset to NULL whenever the task is reassigned.
export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn('assigned_tasks', 'seen_at')) return;
  await knex.schema.alterTable('assigned_tasks', (t) => {
    t.timestamp('seen_at').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('assigned_tasks', (t) => {
    t.dropColumn('seen_at');
  });
}

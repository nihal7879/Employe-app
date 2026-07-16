import type { Knex } from 'knex';

// Track when an assigned-task comment was edited, so the UI can show an
// "edited" marker (matching daily-task comments). Null = never edited.
export async function up(knex: Knex): Promise<void> {
  const has = await knex.schema.hasColumn('assigned_task_comments', 'edited_at');
  if (!has) {
    await knex.schema.alterTable('assigned_task_comments', (t) => {
      t.timestamp('edited_at').nullable();
      t.boolean('is_deleted').defaultTo(false);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const has = await knex.schema.hasColumn('assigned_task_comments', 'edited_at');
  if (has) {
    await knex.schema.alterTable('assigned_task_comments', (t) => {
      t.dropColumn('edited_at');
      t.dropColumn('is_deleted');
    });
  }
}

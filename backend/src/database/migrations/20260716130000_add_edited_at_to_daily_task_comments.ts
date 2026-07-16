import type { Knex } from 'knex';

// Track when a daily-task comment was edited, so the UI can show an "edited"
// marker. Null = never edited.
export async function up(knex: Knex): Promise<void> {
  const has = await knex.schema.hasColumn('daily_task_comments', 'edited_at');
  if (!has) {
    await knex.schema.alterTable('daily_task_comments', (t) => {
      t.timestamp('edited_at').nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const has = await knex.schema.hasColumn('daily_task_comments', 'edited_at');
  if (has) {
    await knex.schema.alterTable('daily_task_comments', (t) => {
      t.dropColumn('edited_at');
    });
  }
}

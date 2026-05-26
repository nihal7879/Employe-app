import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn('daily_tasks', 'progress_status'))) {
    await knex.schema.alterTable('daily_tasks', (t) => {
      t.string('progress_status', 32).nullable().after('submission_status');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('daily_tasks', (t) => {
    t.dropColumn('progress_status');
  });
}

import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Idempotent: the column may already exist from a partially-applied run.
  if (!(await knex.schema.hasColumn('daily_tasks', 'is_break'))) {
    await knex.schema.alterTable('daily_tasks', (t) => {
      t.boolean('is_break').notNullable().defaultTo(false).after('reference');
    });
  }
  // Break entries have no client/project/activity — allow NULL on those FKs.
  // (These MODIFYs rebuild the table and need free disk space.)
  await knex.raw('ALTER TABLE daily_tasks MODIFY client_id INT(11) NULL');
  await knex.raw('ALTER TABLE daily_tasks MODIFY project_id INT(11) NULL');
  await knex.raw('ALTER TABLE daily_tasks MODIFY activity_id INT(11) NULL');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('daily_tasks', (t) => {
    t.dropColumn('is_break');
  });
}

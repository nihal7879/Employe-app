import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn('employees', 'allow_backdated_tasks'))) {
    await knex.schema.alterTable('employees', (t) => {
      // When true, the employee may log tasks for past dates (within the
      // BACKDATE_MAX_DAYS window), not just today.
      t.boolean('allow_backdated_tasks').notNullable().defaultTo(false);
    });
  }
  if (!(await knex.schema.hasColumn('employees', 'allow_log_anytime'))) {
    await knex.schema.alterTable('employees', (t) => {
      // When true, the first-login time floor is bypassed — the employee can
      // log work that starts before their morning Login (e.g. they forgot to
      // log in).
      t.boolean('allow_log_anytime').notNullable().defaultTo(false);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('employees', (t) => {
    t.dropColumn('allow_backdated_tasks');
    t.dropColumn('allow_log_anytime');
  });
}

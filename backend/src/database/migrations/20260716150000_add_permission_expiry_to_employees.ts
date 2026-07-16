import type { Knex } from 'knex';

// Optional expiry for the two task-logging permissions. When set, the permission
// is honored only until this moment; after it passes a sweep auto-closes the
// flag and notifies the employee. Null = permanent (the existing behaviour).
export async function up(knex: Knex): Promise<void> {
  const hasBackdate = await knex.schema.hasColumn('employees', 'allow_backdated_until');
  const hasAnytime = await knex.schema.hasColumn('employees', 'allow_log_anytime_until');
  await knex.schema.alterTable('employees', (t) => {
    if (!hasBackdate) t.timestamp('allow_backdated_until').nullable();
    if (!hasAnytime) t.timestamp('allow_log_anytime_until').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasBackdate = await knex.schema.hasColumn('employees', 'allow_backdated_until');
  const hasAnytime = await knex.schema.hasColumn('employees', 'allow_log_anytime_until');
  await knex.schema.alterTable('employees', (t) => {
    if (hasBackdate) t.dropColumn('allow_backdated_until');
    if (hasAnytime) t.dropColumn('allow_log_anytime_until');
  });
}

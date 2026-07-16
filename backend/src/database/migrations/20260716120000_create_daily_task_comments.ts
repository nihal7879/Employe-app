import type { Knex } from 'knex';

// Comment thread on a DAILY task (the DWR time log). Lets an admin leave a
// comment on an employee's logged task and the employee reply — visible in the
// task detail view. Distinct from assigned_task_comments (which hang off the
// separate assigned_tasks board).
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('daily_task_comments'))) {
    await knex.schema.createTable('daily_task_comments', (t) => {
      t.increments('id').primary();
      t.integer('daily_task_id').notNullable()
        .references('id').inTable('daily_tasks').onDelete('CASCADE');
      t.integer('author_id').notNullable()
        .references('id').inTable('employees').onDelete('CASCADE');
      t.text('body').notNullable();
      t.boolean('is_deleted').defaultTo(false);
      t.timestamp('created_at').defaultTo(knex.fn.now());
      t.index('daily_task_id');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('daily_task_comments');
}

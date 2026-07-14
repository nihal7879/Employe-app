import type { Knex } from 'knex';

// Activity timeline for an assigned task: every status change, reassignment,
// edit, comment and the initial creation — with the actor and timestamp — so the
// task detail can show "what changed, when, and by whom".
export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable('assigned_task_activity')) return;
  await knex.schema.createTable('assigned_task_activity', (t) => {
    t.increments('id').primary();
    t.integer('task_id').unsigned().notNullable()
      .references('id').inTable('assigned_tasks').onDelete('CASCADE');
    t.integer('actor_id').notNullable()
      .references('id').inTable('employees').onDelete('CASCADE');
    // Created / StatusChanged / Reassigned / Updated / Commented
    t.string('type', 30).notNullable();
    t.string('from_value', 255).nullable();
    t.string('to_value', 255).nullable();
    t.string('note', 500).nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index('task_id');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('assigned_task_activity');
}

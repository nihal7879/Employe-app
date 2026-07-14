import type { Knex } from 'knex';

// Status set was simplified to Open / In Progress / Completed. Migrate any
// existing rows off the old values and make 'Open' the column default.
export async function up(knex: Knex): Promise<void> {
  await knex('assigned_tasks').where('status', 'To Do').update({ status: 'Open' });
  await knex('assigned_tasks').where('status', 'On Hold').update({ status: 'In Progress' });
  await knex.schema.alterTable('assigned_tasks', (t) => {
    t.string('status', 20).notNullable().defaultTo('Open').alter();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('assigned_tasks', (t) => {
    t.string('status', 20).notNullable().defaultTo('To Do').alter();
  });
}

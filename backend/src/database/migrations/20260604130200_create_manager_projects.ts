import type { Knex } from 'knex';

// Maps a Manager to the projects the admin assigns them. Display/context only —
// a manager's task visibility is driven by their assigned employees, not these
// projects — but it scopes which projects the manager dashboard highlights.
export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable('manager_projects')) return;
  await knex.schema.createTable('manager_projects', (t) => {
    t.increments('id').primary();
    t.integer('manager_id').notNullable()
      .references('id').inTable('employees').onDelete('CASCADE');
    t.integer('project_id').notNullable()
      .references('id').inTable('projects').onDelete('CASCADE');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.unique(['manager_id', 'project_id']);
    t.index('manager_id');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('manager_projects');
}

import type { Knex } from 'knex';

// Maps a Manager (employees.id with the Manager role) to each employee on their
// team. Drives what a manager can see: their team summary and per-employee
// drill-down are restricted to the employee_ids listed here for that manager.
export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable('manager_employees')) return;
  await knex.schema.createTable('manager_employees', (t) => {
    t.increments('id').primary();
    t.integer('manager_id').notNullable()
      .references('id').inTable('employees').onDelete('CASCADE');
    t.integer('employee_id').notNullable()
      .references('id').inTable('employees').onDelete('CASCADE');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.unique(['manager_id', 'employee_id']);
    t.index('manager_id');
    t.index('employee_id');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('manager_employees');
}

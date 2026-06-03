import type { Knex } from 'knex';

// Stores each employee's Gmail OAuth connection (refresh token) so their
// dashboard can show client emails and turn them into daily tasks. One row per
// employee. The refresh token is long-lived; access tokens are minted on demand.
export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable('gmail_connections')) return;
  await knex.schema.createTable('gmail_connections', (t) => {
    t.increments('id').primary();
    t.integer('employee_id').notNullable().unique()
      .references('id').inTable('employees').onDelete('CASCADE');
    t.string('email', 191).notNullable();
    t.text('refresh_token').notNullable();
    t.text('access_token').nullable();
    t.datetime('token_expiry').nullable();
    // Optional Gmail search query to scope "client tickets" (e.g. a label).
    t.string('query', 255).nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('gmail_connections');
}

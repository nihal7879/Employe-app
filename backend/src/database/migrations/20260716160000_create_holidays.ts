import type { Knex } from 'knex';

// Company holiday calendar. Admin adds dated holidays; employees see upcoming
// ones and a banner on the day itself. Holidays also suppress the "you didn't
// submit tasks" reminder and daily report for that date.
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('holidays'))) {
    await knex.schema.createTable('holidays', (t) => {
      t.increments('id').primary();
      t.date('holiday_date').notNullable();
      t.string('name', 200).notNullable();
      t.string('description', 500).nullable();
      t.boolean('is_deleted').defaultTo(false);
      t.timestamps(true, true);
      t.index('holiday_date');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('holidays');
}

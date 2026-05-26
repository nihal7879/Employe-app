import type { Knex } from 'knex';

const COLS = [
  'created_ip', 'created_gps', 'created_device', 'created_browser',
  'updated_ip', 'updated_gps', 'updated_device', 'updated_browser',
];

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('daily_tasks', (t) => {
    t.string('created_ip', 45).nullable();
    t.string('created_gps', 128).nullable();
    t.string('created_device', 64).nullable();
    t.string('created_browser', 64).nullable();
    t.string('updated_ip', 45).nullable();
    t.string('updated_gps', 128).nullable();
    t.string('updated_device', 64).nullable();
    t.string('updated_browser', 64).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('daily_tasks', (t) => {
    for (const c of COLS) t.dropColumn(c);
  });
}

import type { Knex } from 'knex';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Best-effort read of the current runtime-config notice so the existing (old)
// notice is preserved when we move to the notices table. Falls back to the
// standard default if the file is missing / has no notice set.
function currentNotice(): { message: string; color: string } {
  const fallback = { message: 'Please log each task within 60 minutes of finishing it.', color: 'red' };
  try {
    const rc = JSON.parse(readFileSync(resolve(process.cwd(), 'runtime-config.json'), 'utf8'));
    const message = typeof rc.dashboardNotice === 'string' && rc.dashboardNotice.trim() ? rc.dashboardNotice.trim() : fallback.message;
    const color = typeof rc.dashboardNoticeColor === 'string' && rc.dashboardNoticeColor ? rc.dashboardNoticeColor : fallback.color;
    return { message, color };
  } catch {
    return fallback;
  }
}

// Dashboard notices. Replaces the single runtime-config notice string with a
// scalable list: admins add/edit/retire many notices, employees see the active
// ones scrolling in the dashboard ticker (newest first). Soft-deleted, and an
// is_active flag lets an admin hide a notice without deleting its history.
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('notices'))) {
    await knex.schema.createTable('notices', (t) => {
      t.increments('id').primary();
      t.string('message', 500).notNullable();
      t.string('color', 20).notNullable().defaultTo('red');
      t.boolean('is_active').defaultTo(true);
      t.boolean('is_deleted').defaultTo(false);
      t.timestamps(true, true);
      t.index(['is_active', 'is_deleted']);
    });

    // Carry the existing (old) runtime-config notice into the list so it isn't
    // lost on upgrade and the ticker isn't empty.
    const old = currentNotice();
    await knex('notices').insert({ message: old.message, color: old.color, is_active: true });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('notices');
}

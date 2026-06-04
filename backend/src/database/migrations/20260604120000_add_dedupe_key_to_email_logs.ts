import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn('email_logs', 'dedupe_key'))) {
    await knex.schema.alterTable('email_logs', (t) => {
      // Optional idempotency key, e.g. "Reminder:2026-06-04:user@millicent.in".
      // A UNIQUE index makes the per-recipient send atomic: when the reminder
      // job fires more than once at the same wall-clock time (the in-process
      // @Cron timer AND the Vercel HTTP cron both run at 6:45 PM IST, plus
      // Vercel retries on timeout), only the first invocation can insert the
      // row — the rest hit a duplicate-key error and skip, so each employee
      // gets exactly one reminder. NULL is allowed and never collides (MySQL
      // permits multiple NULLs in a unique index), so non-deduped emails are
      // unaffected.
      t.string('dedupe_key', 255).nullable().unique();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('email_logs', (t) => {
    t.dropColumn('dedupe_key');
  });
}

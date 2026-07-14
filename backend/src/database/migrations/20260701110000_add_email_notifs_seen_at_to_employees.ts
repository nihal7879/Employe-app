import type { Knex } from 'knex';

// When this user last opened the Emails tab of the notification bell. Email logs
// have no per-recipient read flag, so this single watermark is what makes the
// email badge persist across devices and logins (it used to live in
// localStorage, which reset on every new browser and leaked between accounts
// sharing one).
export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn('employees', 'email_notifs_seen_at')) return;
  await knex.schema.alterTable('employees', (t) => {
    t.timestamp('email_notifs_seen_at').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('employees', (t) => {
    t.dropColumn('email_notifs_seen_at');
  });
}

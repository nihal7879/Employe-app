import type { Knex } from 'knex';

// Re-point the "Manager" role to the next sequential id (3) when it landed on a
// higher id due to a gap in the roles auto-increment counter. Auth keys off
// role_name, so this is purely cosmetic — but it keeps the roles table tidy
// (1=Admin, 2=Employee, 3=Manager). Idempotent and safe: only runs when id 3 is
// free and Manager currently has a different id. Also updates any employees that
// reference the old id.
const TARGET_ID = 3;

export async function up(knex: Knex): Promise<void> {
  const mgr = await knex('roles').where({ role_name: 'Manager' }).first();
  if (!mgr || mgr.id === TARGET_ID) return;
  const taken = await knex('roles').where({ id: TARGET_ID }).first();
  if (taken) return; // id 3 is occupied by another role — leave Manager as-is.

  await knex.transaction(async (trx) => {
    await trx.raw('SET FOREIGN_KEY_CHECKS = 0');
    await trx('roles').where({ id: mgr.id }).update({ id: TARGET_ID });
    await trx('employees').where({ role_id: mgr.id }).update({ role_id: TARGET_ID });
    await trx.raw('SET FOREIGN_KEY_CHECKS = 1');
  });
}

export async function down(knex: Knex): Promise<void> {
  // No-op: we don't restore the arbitrary old id. role_name is the stable key.
}

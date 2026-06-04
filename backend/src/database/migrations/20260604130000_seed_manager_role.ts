import type { Knex } from 'knex';

// Seed the third role, "Manager" — a mid-tier role that logs its own daily
// tasks like an Employee but also oversees an admin-assigned team. Authorization
// keys off the role_name string (the JWT carries role_name, not role_id), so the
// numeric id is irrelevant and deliberately NOT forced here. Idempotent: a no-op
// if a Manager row already exists (e.g. inserted by hand in production).
export async function up(knex: Knex): Promise<void> {
  const existing = await knex('roles').where({ role_name: 'Manager' }).first();
  if (!existing) {
    await knex('roles').insert({ role_name: 'Manager', is_active: true, is_deleted: false });
  }
}

export async function down(knex: Knex): Promise<void> {
  // Only drop the role if no employee still references it, to avoid orphaning
  // employees.role_id.
  const role = await knex('roles').where({ role_name: 'Manager' }).first();
  if (!role) return;
  const inUse = await knex('employees').where({ role_id: role.id }).first();
  if (!inUse) await knex('roles').where({ id: role.id }).del();
}

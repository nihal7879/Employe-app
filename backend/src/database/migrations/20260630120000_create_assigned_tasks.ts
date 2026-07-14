import type { Knex } from 'knex';

// Admin/Manager → employee task assignment ("Zoho-style" assigned tasks).
// Distinct from daily_tasks (the DWR log): an assigned_task is work HANDED to an
// employee with a due date, status, priority and a comment thread. The employee
// can later log time against it in the DWR (we deep-link to /tasks prefilled).
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('assigned_tasks'))) {
    await knex.schema.createTable('assigned_tasks', (t) => {
      t.increments('id').primary();
      t.string('title', 255).notNullable();
      t.text('description');
      t.integer('assignee_id').notNullable()
        .references('id').inTable('employees').onDelete('CASCADE');
      t.integer('assigned_by_id').notNullable()
        .references('id').inTable('employees').onDelete('CASCADE');
      t.integer('client_id').nullable()
        .references('id').inTable('clients').onDelete('SET NULL');
      t.integer('project_id').nullable()
        .references('id').inTable('projects').onDelete('SET NULL');
      // To Do / In Progress / On Hold / Completed
      t.string('status', 20).notNullable().defaultTo('To Do');
      // Low / Medium / High / Urgent
      t.string('priority', 20).notNullable().defaultTo('Medium');
      // Free-text tag for the kind of employee/work (e.g. "Developer", "QA").
      t.string('employee_type', 100).nullable();
      t.date('assigned_date').notNullable();
      t.date('due_date').nullable();
      t.timestamp('completed_at').nullable();
      t.boolean('is_active').defaultTo(true);
      t.boolean('is_deleted').defaultTo(false);
      t.timestamps(true, true);
      t.index('assignee_id');
      t.index('assigned_by_id');
      t.index('status');
    });
  }

  if (!(await knex.schema.hasTable('assigned_task_comments'))) {
    await knex.schema.createTable('assigned_task_comments', (t) => {
      t.increments('id').primary();
      t.integer('task_id').unsigned().notNullable()
        .references('id').inTable('assigned_tasks').onDelete('CASCADE');
      t.integer('author_id').notNullable()
        .references('id').inTable('employees').onDelete('CASCADE');
      t.text('body').notNullable();
      // Comma-separated employee ids @mentioned in the comment.
      t.string('mentions', 255).nullable();
      t.timestamp('created_at').defaultTo(knex.fn.now());
      t.index('task_id');
    });
  }

  if (!(await knex.schema.hasTable('app_notifications'))) {
    await knex.schema.createTable('app_notifications', (t) => {
      t.increments('id').primary();
      t.integer('recipient_id').notNullable()
        .references('id').inTable('employees').onDelete('CASCADE');
      // Assignment / Comment / Mention / StatusChange / Reminder
      t.string('type', 40).notNullable();
      t.string('title', 255).notNullable();
      t.text('body').nullable();
      t.string('link', 255).nullable();
      t.integer('task_id').nullable();
      t.boolean('is_read').notNullable().defaultTo(false);
      t.timestamp('created_at').defaultTo(knex.fn.now());
      t.index(['recipient_id', 'is_read']);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('assigned_task_comments');
  await knex.schema.dropTableIfExists('app_notifications');
  await knex.schema.dropTableIfExists('assigned_tasks');
}

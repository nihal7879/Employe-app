import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Knex } from 'knex';
import { KNEX_CONNECTION } from '../database/knex.module';
import { DailyTasksService } from '../daily-tasks/daily-tasks.service';
import { EmailService } from '../email/email.service';
import { adminDailyDigestEmail, employeeDailyReportEmail, reminderEmail } from '../email/templates';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    @Inject(KNEX_CONNECTION) private readonly db: Knex,
    private readonly tasks: DailyTasksService,
    private readonly mail: EmailService,
  ) {}

  // ===== 11:00 PM — full-day report to every employee =====
  @Cron('0 0 23 * * *', { name: 'daily-employee-report', timeZone: process.env.APP_TZ || 'Asia/Kolkata' })
  async sendDailyEmployeeReports() {
    const date = new Date().toISOString().slice(0, 10);
    this.logger.log(`Running 11 PM daily report for ${date}`);
    await this.dispatchEmployeeReports(date, `Your Daily Task Report — ${date}`);
    await this.sendAdminDailySummary(date);
  }

  // ===== 11:00 PM — detailed per-employee digest of the day's work to admin =====
  private async sendAdminDailySummary(date: string) {
    const admin = process.env.ADMIN_EMAIL;
    if (!admin) return;
    const digest = await this.tasks.getAdminDailyDigest(date);
    await this.mail.send({
      to: admin,
      subject: `Team Daily Summary — ${date}`,
      type: 'Daily Summary',
      html: adminDailyDigestEmail(digest),
    });
  }

  private async dispatchEmployeeReports(date: string, subject: string) {
    // Employees only (role_id 2) — admins do not receive a personal task report.
    const employees = await this.db('employees')
      .where({ role_id: 2, is_active: true, is_deleted: false })
      .select('id', 'name', 'email');

    for (const emp of employees) {
      try {
        const report = await this.tasks.getEmployeeReport(emp.id, date);
        await this.mail.send({
          to: emp.email,
          subject,
          type: 'Daily Summary',
          html: employeeDailyReportEmail({
            name: emp.name,
            date,
            total_hours: Number(report.total_hours || 0),
            tasks: report.tasks,
          }),
        });
      } catch (err: any) {
        this.logger.error(`Report failed for ${emp.email}: ${err?.message}`);
      }
    }
  }

  // ===== 6:00 PM — reminder for non-submitters =====
  @Cron('0 0 18 * * *', { name: 'pending-submission-reminder', timeZone: process.env.APP_TZ || 'Asia/Kolkata' })
  async sendPendingReminders() {
    const date = new Date().toISOString().slice(0, 10);
    const submittedIds = await this.db('daily_tasks')
      .where('task_date', date)
      .andWhere('is_deleted', false)
      .distinct('employee_id')
      .pluck('employee_id');


      // Employees only (role_id 2) — admins are not tracked, so no reminder for them.
    const pending = await this.db('employees')
      .where({ role_id: 2, is_active: true, is_deleted: false })
      .whereNotIn('id', submittedIds.length ? submittedIds : [0])
      .select('id', 'name', 'email');

    for (const emp of pending) {
      await this.mail.send({
        to: emp.email,
        subject: `Reminder: submit your daily tasks — ${date}`,
        type: 'Reminder',
        html: reminderEmail(emp.name, date),
      });
    }
  }

  // ===== Monday 8:00 AM — weekly summary to admin =====
  @Cron(CronExpression.EVERY_WEEK, { name: 'weekly-admin-summary', timeZone: process.env.APP_TZ || 'Asia/Kolkata' })
  async weeklyAdminSummary() {
    const admin = process.env.ADMIN_EMAIL;
    if (!admin) return;
    const today = new Date();
    const lastMonday = new Date(today);
    lastMonday.setDate(today.getDate() - 7);
    const range = {
      from: lastMonday.toISOString().slice(0, 10),
      to: today.toISOString().slice(0, 10),
    };
    const totals = await this.db('daily_tasks')
      .leftJoin('employees', 'daily_tasks.employee_id', 'employees.id')
      .where('daily_tasks.is_deleted', false)
      .andWhere('employees.role_id', 2)
      .andWhereBetween('daily_tasks.task_date', [range.from, range.to])
      .sum({ hours: 'daily_tasks.hours_spent' })
      .count({ tasks: 'daily_tasks.id' })
      .first();
    await this.mail.send({
      to: admin,
      subject: `Weekly Summary ${range.from} → ${range.to}`,
      type: 'Weekly Summary',
      html: `<p>Total hours: <b>${totals?.hours || 0}</b></p><p>Total tasks: <b>${totals?.tasks || 0}</b></p>`,
    });
  }

  // ===== 1st of every month 8:00 AM — monthly summary to admin =====
  @Cron('0 0 8 1 * *', { name: 'monthly-admin-summary', timeZone: process.env.APP_TZ || 'Asia/Kolkata' })
  async monthlyAdminSummary() {
    const admin = process.env.ADMIN_EMAIL;
    if (!admin) return;
    const today = new Date();
    const prevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const prevMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
    const range = {
      from: prevMonth.toISOString().slice(0, 10),
      to: prevMonthEnd.toISOString().slice(0, 10),
    };
    const totals = await this.db('daily_tasks')
      .leftJoin('employees', 'daily_tasks.employee_id', 'employees.id')
      .where('daily_tasks.is_deleted', false)
      .andWhere('employees.role_id', 2)
      .andWhereBetween('daily_tasks.task_date', [range.from, range.to])
      .sum({ hours: 'daily_tasks.hours_spent' })
      .count({ tasks: 'daily_tasks.id' })
      .first();
    await this.mail.send({
      to: admin,
      subject: `Monthly Summary ${range.from} → ${range.to}`,
      type: 'Monthly Summary',
      html: `<p>Total hours: <b>${totals?.hours || 0}</b></p><p>Total tasks: <b>${totals?.tasks || 0}</b></p>`,
    });
  }
}

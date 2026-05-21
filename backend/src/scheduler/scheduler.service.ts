import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Knex } from 'knex';
import { KNEX_CONNECTION } from '../database/knex.module';
import { DailyTasksService } from '../daily-tasks/daily-tasks.service';
import { EmailService } from '../email/email.service';
import { employeeDailyReportEmail, reminderEmail } from '../email/templates';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    @Inject(KNEX_CONNECTION) private readonly db: Knex,
    private readonly tasks: DailyTasksService,
    private readonly mail: EmailService,
  ) {}

  // ===== 6:00 AM — yesterday's recap email to every employee =====
  @Cron('0 0 6 * * *', { name: 'morning-yesterday-recap', timeZone: process.env.TZ || 'Asia/Kolkata' })
  async sendMorningRecap() {
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    const date = yesterday.toISOString().slice(0, 10);
    this.logger.log(`Running 6 AM morning recap for ${date}`);
    await this.dispatchEmployeeReports(date, `Your tasks yesterday — ${date}`);
  }

  // ===== 12:00 PM — same-day mid-day report =====
  @Cron('0 0 12 * * *', { name: 'daily-employee-report', timeZone: process.env.TZ || 'Asia/Kolkata' })
  async sendDailyEmployeeReports() {
    const date = new Date().toISOString().slice(0, 10);
    this.logger.log(`Running 12 PM daily report for ${date}`);
    await this.dispatchEmployeeReports(date, `Your Daily Task Report — ${date}`);
  }

  private async dispatchEmployeeReports(date: string, subject: string) {
    const employees = await this.db('employees')
      .where({ is_active: true, is_deleted: false })
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
  @Cron('0 0 18 * * *', { name: 'pending-submission-reminder', timeZone: process.env.TZ || 'Asia/Kolkata' })
  async sendPendingReminders() {
    const date = new Date().toISOString().slice(0, 10);
    const submittedIds = await this.db('daily_tasks')
      .where('task_date', date)
      .andWhere('is_deleted', false)
      .distinct('employee_id')
      .pluck('employee_id');

    const pending = await this.db('employees')
      .where({ is_active: true, is_deleted: false })
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
  @Cron(CronExpression.EVERY_WEEK, { name: 'weekly-admin-summary', timeZone: process.env.TZ || 'Asia/Kolkata' })
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
      .where('is_deleted', false)
      .andWhereBetween('task_date', [range.from, range.to])
      .sum({ hours: 'hours_spent' })
      .count({ tasks: '*' })
      .first();
    await this.mail.send({
      to: admin,
      subject: `Weekly Summary ${range.from} → ${range.to}`,
      type: 'Weekly Summary',
      html: `<p>Total hours: <b>${totals?.hours || 0}</b></p><p>Total tasks: <b>${totals?.tasks || 0}</b></p>`,
    });
  }

  // ===== 1st of every month 8:00 AM — monthly summary to admin =====
  @Cron('0 0 8 1 * *', { name: 'monthly-admin-summary', timeZone: process.env.TZ || 'Asia/Kolkata' })
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
      .where('is_deleted', false)
      .andWhereBetween('task_date', [range.from, range.to])
      .sum({ hours: 'hours_spent' })
      .count({ tasks: '*' })
      .first();
    await this.mail.send({
      to: admin,
      subject: `Monthly Summary ${range.from} → ${range.to}`,
      type: 'Monthly Summary',
      html: `<p>Total hours: <b>${totals?.hours || 0}</b></p><p>Total tasks: <b>${totals?.tasks || 0}</b></p>`,
    });
  }
}

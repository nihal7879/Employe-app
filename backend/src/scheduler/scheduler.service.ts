import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Knex } from 'knex';
import { KNEX_CONNECTION } from '../database/knex.module';
import { DailyTasksService } from '../daily-tasks/daily-tasks.service';
import { EmailService } from '../email/email.service';
import { adminDailyDigestEmail, employeeDailyReportEmail, reminderEmail } from '../email/templates';
import { APP_CONFIG } from '../config/app-config';

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
    // Always include nirav@millicent.in alongside the configured ADMIN_EMAIL
    // (deduped). Nodemailer accepts a comma-separated recipient list.
    const recipients = Array.from(
      new Set([process.env.ADMIN_EMAIL, 'nirav@millicent.in'].filter(Boolean) as string[]),
    ).join(', ');
    if (!recipients) return;
    const digest = await this.tasks.getAdminDailyDigest(date);
    const overrides = await this.tasks.getLoginMismatches(date);
    await this.mail.send({
      to: recipients,
      subject: `Team Daily Summary — ${date}`,
      type: 'Daily Summary',
      html: adminDailyDigestEmail({ ...digest, overrides }),
    });
  }

  // Convert a mysql2 DATETIME (returned as a JS Date in server-local time, or
  // sometimes a string) to "HH:MM:SS". Mirrors the audit module's toHMS so the
  // times in the email match what the app shows elsewhere.
  private hms(ts: unknown): string | null {
    if (ts instanceof Date) {
      const h = String(ts.getHours()).padStart(2, '0');
      const mi = String(ts.getMinutes()).padStart(2, '0');
      const s = String(ts.getSeconds()).padStart(2, '0');
      return `${h}:${mi}:${s}`;
    }
    if (ts == null) return null;
    const m = String(ts).match(/(\d{2}):(\d{2}):(\d{2})/);
    return m ? `${m[1]}:${m[2]}:${m[3]}` : null;
  }

  // First login (within the day-start window) and last logout for the day.
  private async dayBounds(employee_id: number, date: string) {
    const login = await this.db('audit_logs')
      .where({ employee_id, event_type: 'Login' })
      .whereRaw('DATE(created_at) = ?', [date])
      .whereRaw('TIME(created_at) BETWEEN ? AND ?', [APP_CONFIG.dayStart.earliest, APP_CONFIG.dayStart.latest])
      .min({ ts: 'created_at' })
      .first();
    const logout = await this.db('audit_logs')
      .where({ employee_id, event_type: 'Logout' })
      .whereRaw('DATE(created_at) = ?', [date])
      .max({ ts: 'created_at' })
      .first();
    return {
      first_login: this.hms(login?.ts),
      last_logout: this.hms(logout?.ts),
    };
  }

  private async dispatchEmployeeReports(date: string, subject: string) {
    // Employees only (role_id 2) — admins do not receive a personal task report.
    const employees = await this.db('employees')
      .where({ role_id: 2, is_active: true, is_deleted: false })
      .select('id', 'name', 'email');

    for (const emp of employees) {
      try {
        const report = await this.tasks.getEmployeeReport(emp.id, date);
        // No submission today → don't send an empty daily report to this person.
        if (!report.tasks || report.tasks.length === 0) continue;
        const bounds = await this.dayBounds(emp.id, date);
        await this.mail.send({
          to: emp.email,
          subject,
          type: 'Daily Summary',
          html: employeeDailyReportEmail({
            name: emp.name,
            date,
            total_hours: Number(report.total_hours || 0),
            tasks: report.tasks,
            first_login: bounds.first_login,
            last_logout: bounds.last_logout,
          }),
        });
      } catch (err: any) {
        this.logger.error(`Report failed for ${emp.email}: ${err?.message}`);
      }
    }
  }

  // ===== 6:45 PM — reminder for non-submitters =====
  @Cron('0 45 18 * * *', { name: 'pending-submission-reminder', timeZone: process.env.APP_TZ || 'Asia/Kolkata' })
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

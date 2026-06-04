import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Knex } from 'knex';
import { KNEX_CONNECTION } from '../database/knex.module';
import { DailyTasksService } from '../daily-tasks/daily-tasks.service';
import { EmailService } from '../email/email.service';
import { adminDailyDigestEmail, employeeDailyReportEmail, reminderEmail } from '../email/templates';
import { APP_CONFIG } from '../config/app-config';
import { LOGGING_ROLE_NAMES } from '../common/constants';

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
    await this.sendManagerDailySummaries(date);
  }

  // ===== 11:00 PM — team daily summary to each manager, scoped to the
  // employees the admin assigned to them (the same digest the admin receives,
  // but only for that manager's team). =====
  private async sendManagerDailySummaries(date: string) {
    const managers = await this.db('employees')
      .join('roles', 'employees.role_id', 'roles.id')
      .where('roles.role_name', 'Manager')
      .andWhere({ 'employees.is_active': true, 'employees.is_deleted': false })
      .whereNotNull('employees.email')
      .select('employees.id', 'employees.name', 'employees.email');

    for (const mgr of managers) {
      try {
        const empIds = await this.db('manager_employees')
          .join('employees', 'manager_employees.employee_id', 'employees.id')
          .where('manager_employees.manager_id', mgr.id)
          .andWhere({ 'employees.is_active': true, 'employees.is_deleted': false })
          .pluck('manager_employees.employee_id');
        if (!empIds.length) continue; // nothing assigned → no team email
        const digest = await this.tasks.getAdminDailyDigest(date, empIds);
        const overrides = await this.tasks.getLoginMismatches(date, empIds);
        await this.mail.send({
          to: mgr.email,
          subject: `Your Team Daily Summary — ${date}`,
          type: 'Daily Summary',
          html: adminDailyDigestEmail({ ...digest, overrides }),
          dedupeKey: `ManagerDailySummary:${date}:${mgr.id}`,
        });
      } catch (err: any) {
        this.logger.error(`Manager summary failed for ${mgr.email}: ${err?.message}`);
      }
    }
  }

  // ===== 11:00 PM — detailed per-employee digest of the day's work to admin =====
  private async sendAdminDailySummary(date: string) {
    const recipients = process.env.ADMIN_EMAIL;
    if (!recipients) return;
    const digest = await this.tasks.getAdminDailyDigest(date);
    const overrides = await this.tasks.getLoginMismatches(date);
    await this.mail.send({
      to: recipients,
      subject: `Team Daily Summary — ${date}`,
      type: 'Daily Summary',
      html: adminDailyDigestEmail({ ...digest, overrides }),
      dedupeKey: `AdminDailySummary:${date}`,
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
    // Employees + Managers log tasks and receive a personal report; admins don't.
    const employees = await this.db('employees')
      .where({ is_active: true, is_deleted: false })
      .whereIn('role_id', this.db('roles').whereIn('role_name', LOGGING_ROLE_NAMES).select('id'))
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
          dedupeKey: `EmployeeDailyReport:${date}:${String(emp.email).toLowerCase()}`,
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


      // Employees + Managers are tracked for submission; admins are not reminded.
    const pending = await this.db('employees')
      .where({ is_active: true, is_deleted: false })
      .whereIn('role_id', this.db('roles').whereIn('role_name', LOGGING_ROLE_NAMES).select('id'))
      .whereNotIn('id', submittedIds.length ? submittedIds : [0])
      .select('id', 'name', 'email');

    // Idempotency guard. This job fires more than once at the same wall-clock
    // time — the in-process @Cron timer AND the Vercel HTTP cron both run at
    // 6:45 PM IST, and on Vercel a serverless timeout makes the invocation
    // RETRY — so employees previously received 2–4 copies. The old guard read a
    // one-time snapshot of email_logs and then sent in a loop, but the log row
    // is only written later inside mail.send, so concurrent invocations all
    // read the same empty snapshot and each sent to everyone. The fix is a
    // per-recipient dedupeKey claimed atomically via a UNIQUE index in
    // email_logs: the first invocation inserts the row, the rest hit a
    // duplicate-key error and skip — exactly one reminder per employee per day.
    for (const emp of pending) {
      await this.mail.send({
        to: emp.email,
        subject: `Reminder: submit your daily tasks — ${date}`,
        type: 'Reminder',
        html: reminderEmail(emp.name, date),
        dedupeKey: `Reminder:${date}:${String(emp.email).toLowerCase()}`,
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
      .whereIn('employees.role_id', this.db('roles').whereIn('role_name', LOGGING_ROLE_NAMES).select('id'))
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
      .whereIn('employees.role_id', this.db('roles').whereIn('role_name', LOGGING_ROLE_NAMES).select('id'))
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

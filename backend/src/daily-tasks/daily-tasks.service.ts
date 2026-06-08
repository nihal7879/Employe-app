import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Knex } from 'knex';
import { KNEX_CONNECTION } from '../database/knex.module';
import type { RequestContext } from '../common/utils/request-context';
import { CreateDailyTaskDto, ListDailyTasksDto, UpdateDailyTaskDto } from './dto/daily-task.dto';
import { APP_CONFIG } from '../config/app-config';
import { LOGGING_ROLE_NAMES } from '../common/constants';

@Injectable()
export class DailyTasksService {
  constructor(@Inject(KNEX_CONNECTION) private readonly db: Knex) {}

  private base() {
    return this.db('daily_tasks')
      .leftJoin('employees', 'daily_tasks.employee_id', 'employees.id')
      .leftJoin('departments', 'employees.department_id', 'departments.id')
      .leftJoin('clients', 'daily_tasks.client_id', 'clients.id')
      .leftJoin('projects', 'daily_tasks.project_id', 'projects.id')
      .leftJoin('activities', 'daily_tasks.activity_id', 'activities.id')
      .where('daily_tasks.is_deleted', false)
      .select(
        'daily_tasks.*',
        'employees.name as employee_name',
        'employees.email as employee_email',
        'employees.employee_code as employee_code',
        'departments.department_name as department_name',
        'clients.client_name as client_name',
        'projects.project_name as project_name',
        'projects.project_code as project_code',
        'activities.activity_name as activity_name',
      );
  }

  // Normalize a filter value into a list of ids. Accepts a single id (number or
  // string) or a comma-separated string ("1,2,3"), so the drilldown can filter
  // by multiple selections at once. Invalid/empty entries are dropped.
  private toIds(v?: number | string | (number | string)[]): number[] {
    if (v == null) return [];
    const arr = Array.isArray(v) ? v : String(v).split(',');
    return arr.map((x) => Number(x)).filter((n) => Number.isFinite(n));
  }

  async list(q: ListDailyTasksDto, scope?: { employee_id?: number; employee_ids?: number[] }) {
    let qb = this.base();
    // A non-admin scope pins the query to one employee; otherwise honor the
    // (possibly multi-value) employee_id filter from the request.
    const empIds = scope?.employee_id != null ? [scope.employee_id] : this.toIds(q.employee_id);
    if (empIds.length) qb = qb.whereIn('daily_tasks.employee_id', empIds);
    // Restrict to a fixed set of employees (e.g. a manager's team). Combined
    // with empIds above, a requested employee outside the set yields no rows.
    if (scope?.employee_ids) qb = qb.whereIn('daily_tasks.employee_id', scope.employee_ids.length ? scope.employee_ids : [0]);
    const clientIds = this.toIds(q.client_id);
    if (clientIds.length) qb = qb.whereIn('daily_tasks.client_id', clientIds);
    const projectIds = this.toIds(q.project_id);
    if (projectIds.length) qb = qb.whereIn('daily_tasks.project_id', projectIds);
    const activityIds = this.toIds(q.activity_id);
    if (activityIds.length) qb = qb.whereIn('daily_tasks.activity_id', activityIds);
    if (q.submission_status) qb = qb.where('daily_tasks.submission_status', q.submission_status);
    if (q.progress_status) qb = qb.where('daily_tasks.progress_status', q.progress_status);
    if (q.from) qb = qb.where('daily_tasks.task_date', '>=', q.from);
    if (q.to) qb = qb.where('daily_tasks.task_date', '<=', q.to);
    return qb.orderBy('daily_tasks.task_date', 'desc').orderBy('daily_tasks.created_at', 'desc');
  }

  async findOne(id: number) {
    const row = await this.base().andWhere('daily_tasks.id', id).first();
    if (!row) throw new NotFoundException('Daily task not found');
    return row;
  }

  // First 8AM-11:59PM Login event for the employee on the given date. Tasks
  // can't start before this time (the user wasn't "at work" yet). Returns
  // "HH:MM:SS" or null if no qualifying login exists.
  private async firstDayLogin(employee_id: number, date: string): Promise<string | null> {
    const row = await this.db('audit_logs')
      .where({ employee_id, event_type: 'Login' })
      .whereRaw('DATE(created_at) = ?', [date])
      .whereRaw('TIME(created_at) BETWEEN ? AND ?', [APP_CONFIG.dayStart.earliest, APP_CONFIG.dayStart.latest])
      .orderBy('created_at', 'asc')
      .first('created_at');
    if (!row) return null;
    const m = String(row.created_at).match(/(\d{2}):(\d{2}):(\d{2})/);
    return m ? `${m[1]}:${m[2]}:${m[3]}` : null;
  }

  // Per-employee task-logging permissions.
  private async employeePerms(employee_id: number) {
    const row = await this.db('employees')
      .where({ id: employee_id })
      .first('allow_backdated_tasks', 'allow_log_anytime');
    return {
      allow_backdated_tasks: !!row?.allow_backdated_tasks,
      allow_log_anytime: !!row?.allow_log_anytime,
    };
  }

  // Validate the task_date against the employee's backdating permission.
  // Without permission, only today is allowed; with it, any date from
  // (today - backdateMaxDays) through today — never the future.
  private assertDateAllowed(taskDate: string, allowBackdated: boolean) {
    const today = new Date().toISOString().slice(0, 10);
    if (taskDate === today) return;
    if (!allowBackdated) {
      throw new ForbiddenException('You can only log tasks for today.');
    }
    if (taskDate > today) {
      throw new ForbiddenException('Tasks cannot be logged for a future date.');
    }
    const floor = new Date(today + 'T00:00:00Z');
    floor.setUTCDate(floor.getUTCDate() - APP_CONFIG.backdateMaxDays);
    const earliest = floor.toISOString().slice(0, 10);
    if (taskDate < earliest) {
      throw new ForbiddenException(`You can only backdate tasks up to ${APP_CONFIG.backdateMaxDays} days.`);
    }
  }

  // The earliest start_time the employee may log given their day-start login:
  // (login − loginGraceMinutes), clamped to 00:00, as "HH:MM:SS".
  private earliestStart(dayStart: string): string {
    const m = dayStart.match(/^(\d{1,2}):(\d{2})/);
    if (!m) return dayStart;
    const mins = Math.max(0, Number(m[1]) * 60 + Number(m[2]) - APP_CONFIG.loginGraceMinutes);
    const hh = String(Math.floor(mins / 60)).padStart(2, '0');
    const mm = String(mins % 60).padStart(2, '0');
    return `${hh}:${mm}:00`;
  }

  private fmt12(t?: string) {
    if (!t) return '';
    const m = t.match(/^(\d{1,2}):(\d{2})/);
    if (!m) return t;
    const h = Number(m[1]);
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${m[2]} ${period}`;
  }

  // True when a task's start_time is before the allowed floor, compared at
  // MINUTE granularity. The floor is (day-start login − loginGraceMinutes), so
  // an employee may log tasks for the grace window preceding their first login.
  // The picker stores start_time as "HH:MM" while logins carry seconds
  // ("HH:MM:SS"); a raw string compare wrongly flags a task that starts in the
  // same minute as the floor ("10:20" < "10:20:00"). Truncating both to minutes
  // keeps the guard in sync with what the picker offers.
  private startsBeforeLogin(startTime: string, dayStart: string): boolean {
    const toMins = (t: string) => {
      const m = t.match(/^(\d{1,2}):(\d{2})/);
      return m ? Number(m[1]) * 60 + Number(m[2]) : -1;
    };
    const start = toMins(startTime);
    const login = toMins(dayStart);
    if (start < 0 || login < 0) return false;
    const floor = Math.max(0, login - APP_CONFIG.loginGraceMinutes);
    return start < floor;
  }

  async create(employee_id: number, ctx: RequestContext, dto: CreateDailyTaskDto) {
    const perms = await this.employeePerms(employee_id);
    const taskDate = String(dto.task_date).slice(0, 10);

    // Enforce the today-only rule unless the employee may backdate.
    this.assertDateAllowed(taskDate, perms.allow_backdated_tasks);

    // End must come after start — a non-positive span is an input error, not
    // an overnight task (daily tasks live within a single work day).
    if (dto.start_time && dto.end_time && dto.end_time <= dto.start_time) {
      throw new ConflictException('End time must be after start time.');
    }

    // Reject if another non-deleted task for this employee on the same date
    // overlaps the new [start_time, end_time) window. Two ranges overlap when
    // existing.start_time < new.end_time AND existing.end_time > new.start_time.
    if (dto.start_time && dto.end_time) {
      const clash = await this.db('daily_tasks')
        .where({ employee_id, task_date: dto.task_date, is_deleted: false })
        .andWhere('start_time', '<', dto.end_time)
        .andWhere('end_time', '>', dto.start_time)
        .first('id', 'start_time', 'end_time', 'task_title');
      if (clash) {
        throw new ConflictException(
          `This time slot overlaps an existing task (${clash.start_time}–${clash.end_time}: "${clash.task_title}"). Pick a different time.`,
        );
      }
    }

    // Reject if the task starts BEFORE the employee's first login of the day
    // (8AM-8PM window). The employee wasn't logged in yet, so they can't have
    // been working on this task at that time. Skipped when the employee has the
    // log-anytime permission (e.g. they forgot to log in that morning).
    if (!perms.allow_log_anytime && dto.start_time && dto.task_date) {
      const dayStart = await this.firstDayLogin(employee_id, taskDate);
      if (dayStart && this.startsBeforeLogin(dto.start_time, dayStart)) {
        throw new ConflictException(
          `You logged in at ${this.fmt12(dayStart)} on ${dto.task_date}. The earliest you can log a task is ${this.fmt12(this.earliestStart(dayStart))}.`,
        );
      }
    }

    const payload = {
      employee_id,
      ip_address: ctx.ip,
      submission_status: dto.submission_status || 'Submitted',
      ...dto,
      created_ip: ctx.ip,
      created_gps: ctx.gps,
      created_device: ctx.device,
      created_browser: ctx.browser,
    };
    const [id] = await this.db('daily_tasks').insert(payload);
    return this.findOne(id);
  }

  async update(id: number, user: { id: number; role: string }, dto: UpdateDailyTaskDto, ctx?: RequestContext) {
    const existing = await this.findOne(id);
    if (user.role !== 'Admin' && existing.employee_id !== user.id) {
      throw new ForbiddenException('Cannot edit another employee\'s task');
    }

    // Same login-time guard applies when start_time is being changed: an
    // edited task still can't begin before the employee's first login of the
    // day. Admin edits are allowed to override (for corrections), as are
    // employees granted the log-anytime permission.
    if (user.role !== 'Admin' && dto.start_time) {
      const perms = await this.employeePerms(existing.employee_id);
      if (!perms.allow_log_anytime) {
        const taskDate = (dto.task_date || String(existing.task_date)).slice(0, 10);
        const dayStart = await this.firstDayLogin(existing.employee_id, taskDate);
        if (dayStart && this.startsBeforeLogin(dto.start_time, dayStart)) {
          throw new ConflictException(
            `You logged in at ${this.fmt12(dayStart)} on ${taskDate}. The earliest a task can start is ${this.fmt12(this.earliestStart(dayStart))}.`,
          );
        }
      }
    }

    // End must come after start, using the effective (post-edit) times. Compare
    // at minute granularity since stored times carry seconds ("HH:MM:SS") while
    // edits arrive as "HH:MM".
    const effStart = (dto.start_time ?? existing.start_time) as string | null;
    const effEnd = (dto.end_time ?? existing.end_time) as string | null;
    if (effStart && effEnd && String(effEnd).slice(0, 5) <= String(effStart).slice(0, 5)) {
      throw new ConflictException('End time must be after start time.');
    }

    const auditFields = ctx ? {
      updated_ip: ctx.ip,
      updated_gps: ctx.gps,
      updated_device: ctx.device,
      updated_browser: ctx.browser,
    } : {};
    await this.db('daily_tasks').where({ id }).update({ ...dto, ...auditFields });
    return this.findOne(id);
  }

  async remove(id: number, user: { id: number; role: string }, ctx?: RequestContext) {
    const existing = await this.findOne(id);
    if (user.role !== 'Admin' && existing.employee_id !== user.id) {
      throw new ForbiddenException('Cannot delete another employee\'s task');
    }
    const auditFields = ctx ? {
      updated_ip: ctx.ip,
      updated_gps: ctx.gps,
      updated_device: ctx.device,
      updated_browser: ctx.browser,
    } : {};
    await this.db('daily_tasks').where({ id }).update({ is_deleted: true, is_active: false, ...auditFields });
    return { success: true };
  }

  // ------- Helpers used by reports & scheduler -------

  // Employees who logged ≥1 task starting BEFORE their first login of the day
  // (the login-grace override). Used by the admin digest email and the
  // compliance view. Returns name, code, first login, earliest pre-login start,
  // and the count of such tasks.
  async getLoginMismatches(date: string, employeeIds?: number[]) {
    const firstLogins = this.db('audit_logs')
      .where('event_type', 'Login')
      .whereRaw('DATE(created_at) = ?', [date])
      .whereRaw('TIME(created_at) BETWEEN ? AND ?', [APP_CONFIG.dayStart.earliest, APP_CONFIG.dayStart.latest])
      .groupBy('employee_id')
      .select('employee_id')
      .min({ first_login: 'created_at' })
      .as('fl');

    return this.db('daily_tasks as dt')
      .join('employees as e', 'e.id', 'dt.employee_id')
      .leftJoin('departments as d', 'e.department_id', 'd.id')
      .join(firstLogins, 'fl.employee_id', 'dt.employee_id')
      .where('dt.is_deleted', false)
      .andWhere('dt.task_date', date)
      .modify((qb) => { if (employeeIds) qb.whereIn('e.id', employeeIds.length ? employeeIds : [0]); })
      .whereNotNull('dt.start_time')
      .whereRaw('dt.start_time < TIME(fl.first_login)')
      .groupBy('e.id', 'e.name', 'e.employee_code', 'e.email', 'd.department_name')
      .select(
        'e.id',
        'e.name',
        'e.employee_code',
        'e.email',
        'd.department_name',
        this.db.raw('TIME(MIN(fl.first_login)) as first_login'),
        this.db.raw('MIN(dt.start_time) as earliest_task'),
      )
      .count({ tasks_before_login: 'dt.id' })
      .orderBy('tasks_before_login', 'desc');
  }

  async getEmployeeReport(employee_id: number, date: string) {
    const rows = await this.base()
      .andWhere('daily_tasks.employee_id', employee_id)
      .andWhere('daily_tasks.task_date', date);
    const total_hours = rows.reduce((sum, r) => sum + Number(r.hours_spent || 0), 0);
    return { date, total_hours, tasks: rows };
  }

  // Per-employee digest for the admin team summary (admins excluded; Employees
  // and Managers — everyone who logs daily tasks).
  async getAdminDailySummary(date: string) {
    const employees = await this.db('employees')
      .where({ is_active: true, is_deleted: false })
      .whereIn('role_id', this.db('roles').whereIn('role_name', LOGGING_ROLE_NAMES).select('id'))
      .select('id', 'name')
      .orderBy('name');

    const agg = await this.db('daily_tasks')
      .where('is_deleted', false)
      .andWhere('task_date', date)
      .groupBy('employee_id')
      .select('employee_id')
      .count({ task_count: 'id' })
      .sum({ total_hours: 'hours_spent' });

    const byEmp = new Map<number, any>(agg.map((a: any) => [a.employee_id, a]));
    const rows = employees.map((e: any) => {
      const a = byEmp.get(e.id);
      return {
        employee_name: e.name,
        task_count: Number(a?.task_count || 0),
        total_hours: Number(a?.total_hours || 0),
      };
    });
    const grand_total_hours = rows.reduce((s, r) => s + r.total_hours, 0);
    const grand_total_tasks = rows.reduce((s, r) => s + r.task_count, 0);
    return { date, rows, grand_total_hours, grand_total_tasks };
  }

  // Detailed per-employee digest for the admin (each employee's full task list).
  // Pass employeeIds to scope it to one team (e.g. a manager's daily summary).
  async getAdminDailyDigest(date: string, employeeIds?: number[]) {
    const employees = await this.db('employees')
      .where({ is_active: true, is_deleted: false })
      .modify((qb) => {
        if (employeeIds) qb.whereIn('id', employeeIds.length ? employeeIds : [0]);
        else qb.whereIn('role_id', this.db('roles').whereIn('role_name', LOGGING_ROLE_NAMES).select('id'));
      })
      .select('id', 'name')
      .orderBy('name');

    const allTasks = await this.base()
      .andWhere('daily_tasks.task_date', date)
      .modify((qb) => { if (employeeIds) qb.whereIn('daily_tasks.employee_id', employeeIds.length ? employeeIds : [0]); });
    const byEmp = new Map<number, any[]>();
    for (const t of allTasks) {
      if (!byEmp.has(t.employee_id)) byEmp.set(t.employee_id, []);
      byEmp.get(t.employee_id)!.push(t);
    }

    const all = employees.map((e: any) => {
      const tasks = byEmp.get(e.id) || [];
      const total_hours = tasks.reduce((s, t) => s + Number(t.hours_spent || 0), 0);
      return { employee_name: e.name, total_hours, task_count: tasks.length, tasks };
    });
    const sections = all.filter((s) => s.task_count > 0);
    const notSubmitted = all.filter((s) => s.task_count === 0).map((s) => s.employee_name);
    const grand_total_hours = sections.reduce((s, r) => s + r.total_hours, 0);
    const grand_total_tasks = sections.reduce((s, r) => s + r.task_count, 0);
    return { date, sections, notSubmitted, grand_total_hours, grand_total_tasks };
  }

  async getEmployeeRangeReport(employee_id: number, from: string, to: string) {
    const rows = await this.base()
      .andWhere('daily_tasks.employee_id', employee_id)
      .andWhereBetween('daily_tasks.task_date', [from, to]);
    const total_hours = rows.reduce((sum, r) => sum + Number(r.hours_spent || 0), 0);
    return { from, to, total_hours, tasks: rows };
  }
}

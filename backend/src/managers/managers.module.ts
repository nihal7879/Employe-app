import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Injectable,
  Module,
  Param,
  ParseIntPipe,
  Patch,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsArray, IsBoolean, IsInt, IsOptional } from 'class-validator';
import { Knex } from 'knex';
import { KNEX_CONNECTION } from '../database/knex.module';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { DailyTasksModule } from '../daily-tasks/daily-tasks.module';
import { DailyTasksService } from '../daily-tasks/daily-tasks.service';
import { APP_CONFIG } from '../config/app-config';

class SetAssignmentsDto {
  @IsArray() @IsInt({ each: true }) employee_ids: number[];
  @IsArray() @IsInt({ each: true }) project_ids: number[];
}

class TeamPermissionDto {
  @IsOptional() @IsBoolean() allow_backdated_tasks?: boolean;
  @IsOptional() @IsBoolean() allow_log_anytime?: boolean;
}

@Injectable()
class ManagersService {
  constructor(
    @Inject(KNEX_CONNECTION) private readonly db: Knex,
    private readonly tasks: DailyTasksService,
  ) {}

  // Numeric id of the Manager role. Authorization elsewhere uses the role_name
  // string, but the employees table stores role_id, so we resolve it here.
  private async managerRoleId(): Promise<number> {
    const row = await this.db('roles').where({ role_name: 'Manager' }).first('id');
    if (!row) throw new BadRequestException('Manager role is not configured');
    return row.id;
  }

  // The employee ids on a manager's team. Single source of truth for both the
  // team summary query and the drill-down authorization guard.
  async assignedEmployeeIds(manager_id: number): Promise<number[]> {
    return this.db('manager_employees')
      .join('employees', 'manager_employees.employee_id', 'employees.id')
      .where('manager_employees.manager_id', manager_id)
      .andWhere('employees.is_deleted', false)
      .pluck('manager_employees.employee_id');
  }

  // Admin: every Manager, with how many employees/projects each is assigned.
  async listManagers() {
    const roleId = await this.managerRoleId();
    const managers = await this.db('employees')
      .where({ role_id: roleId, is_active: true, is_deleted: false })
      .select('id', 'name', 'email', 'employee_code')
      .orderBy('name');
    if (!managers.length) return [];
    const ids = managers.map((m: any) => m.id);
    const empCounts = await this.db('manager_employees')
      .whereIn('manager_id', ids)
      .groupBy('manager_id')
      .select('manager_id')
      .count({ c: 'id' });
    const projCounts = await this.db('manager_projects')
      .whereIn('manager_id', ids)
      .groupBy('manager_id')
      .select('manager_id')
      .count({ c: 'id' });
    const empMap = new Map(empCounts.map((r: any) => [r.manager_id, Number(r.c)]));
    const projMap = new Map(projCounts.map((r: any) => [r.manager_id, Number(r.c)]));
    return managers.map((m: any) => ({
      ...m,
      employee_count: empMap.get(m.id) || 0,
      project_count: projMap.get(m.id) || 0,
    }));
  }

  // The assigned employees and projects for a manager (full rows for display).
  async getAssignments(manager_id: number) {
    const employees = await this.db('manager_employees')
      .join('employees', 'manager_employees.employee_id', 'employees.id')
      .where('manager_employees.manager_id', manager_id)
      .andWhere('employees.is_deleted', false)
      .select('employees.id', 'employees.name', 'employees.email', 'employees.employee_code')
      .orderBy('employees.name');
    const projects = await this.db('manager_projects')
      .join('projects', 'manager_projects.project_id', 'projects.id')
      .leftJoin('clients', 'projects.client_id', 'clients.id')
      .where('manager_projects.manager_id', manager_id)
      .andWhere('projects.is_deleted', false)
      .select(
        'projects.id',
        'projects.project_name',
        'projects.project_code',
        'clients.id as client_id',
        'clients.client_name',
      )
      .orderBy('projects.project_name');
    return { employees, projects };
  }

  // Admin: replace a manager's full set of assigned employees + projects.
  async setAssignments(manager_id: number, dto: SetAssignmentsDto) {
    const roleId = await this.managerRoleId();
    const mgr = await this.db('employees')
      .where({ id: manager_id, is_deleted: false })
      .first('id', 'role_id');
    if (!mgr || mgr.role_id !== roleId) {
      throw new BadRequestException('Target employee is not a Manager');
    }

    const employeeIds = [...new Set((dto.employee_ids || []).map(Number))];
    const projectIds = [...new Set((dto.project_ids || []).map(Number))];

    if (employeeIds.length) {
      const valid = await this.db('employees')
        .whereIn('id', employeeIds)
        .andWhere('is_deleted', false)
        .pluck('id');
      if (valid.length !== employeeIds.length) {
        throw new BadRequestException('One or more assigned employees do not exist');
      }
    }
    if (projectIds.length) {
      const valid = await this.db('projects')
        .whereIn('id', projectIds)
        .andWhere('is_deleted', false)
        .pluck('id');
      if (valid.length !== projectIds.length) {
        throw new BadRequestException('One or more assigned projects do not exist');
      }
    }

    await this.db.transaction(async (trx) => {
      await trx('manager_employees').where('manager_id', manager_id).del();
      await trx('manager_projects').where('manager_id', manager_id).del();
      if (employeeIds.length) {
        await trx('manager_employees').insert(
          employeeIds.map((employee_id) => ({ manager_id, employee_id })),
        );
      }
      if (projectIds.length) {
        await trx('manager_projects').insert(
          projectIds.map((project_id) => ({ manager_id, project_id })),
        );
      }
    });

    return this.getAssignments(manager_id);
  }

  // Manager: per-employee task summary for a date across the whole team.
  // Includes assigned employees with zero tasks so the dashboard lists everyone.
  async teamSummary(manager_id: number, date: string) {
    const empIds = await this.assignedEmployeeIds(manager_id);
    if (!empIds.length) {
      return { date, rows: [], grand_total_hours: 0, grand_total_tasks: 0, by_project: [], by_client: [] };
    }
    const employees = await this.db('employees')
      .whereIn('id', empIds)
      .andWhere('is_deleted', false)
      .select('id', 'name', 'employee_code')
      .orderBy('name');
    const agg = await this.db('daily_tasks')
      .where('is_deleted', false)
      .andWhere('task_date', date)
      .whereIn('employee_id', empIds)
      .groupBy('employee_id')
      .select('employee_id')
      .count({ task_count: 'id' })
      .sum({ total_hours: 'hours_spent' });
    const byEmp = new Map<number, any>(agg.map((a: any) => [a.employee_id, a]));
    const rows = employees.map((e: any) => {
      const a = byEmp.get(e.id);
      return {
        employee_id: e.id,
        employee_name: e.name,
        employee_code: e.employee_code,
        task_count: Number(a?.task_count || 0),
        total_hours: Number(a?.total_hours || 0),
      };
    });
    const grand_total_hours = rows.reduce((s, r) => s + r.total_hours, 0);
    const grand_total_tasks = rows.reduce((s, r) => s + r.task_count, 0);

    const by_project = await this.groupBreakdown(date, empIds, 'project');
    const by_client = await this.groupBreakdown(date, empIds, 'client');

    return { date, rows, grand_total_hours, grand_total_tasks, by_project, by_client };
  }

  // Team task hours/counts grouped by project or client for a date. Shared by
  // the project-wise and client-wise breakdowns on the manager dashboard.
  private async groupBreakdown(date: string, empIds: number[], by: 'project' | 'client') {
    const table = by === 'project' ? 'projects' : 'clients';
    const fkCol = by === 'project' ? 'daily_tasks.project_id' : 'daily_tasks.client_id';
    const nameCol = by === 'project' ? 'projects.project_name' : 'clients.client_name';
    const rows = await this.db('daily_tasks')
      .leftJoin(table, fkCol, `${table}.id`)
      .where('daily_tasks.is_deleted', false)
      .andWhere('daily_tasks.task_date', date)
      .whereIn('daily_tasks.employee_id', empIds)
      .groupBy(fkCol, nameCol)
      .select(this.db.raw(`COALESCE(${nameCol}, 'Unassigned') as name`))
      .count({ task_count: 'daily_tasks.id' })
      .sum({ total_hours: 'daily_tasks.hours_spent' });
    return rows
      .map((r: any) => ({
        name: r.name,
        task_count: Number(r.task_count || 0),
        total_hours: Number(r.total_hours || 0),
      }))
      .sort((a, b) => b.total_hours - a.total_hours);
  }

  // Manager: one assigned employee's full task list for a date. The assignment
  // check is the security boundary — a manager may only drill into their team.
  async employeeDay(manager_id: number, employee_id: number, date: string) {
    const empIds = await this.assignedEmployeeIds(manager_id);
    if (!empIds.includes(employee_id)) {
      throw new ForbiddenException('Employee is not on your team');
    }
    return this.tasks.getEmployeeReport(employee_id, date);
  }

  // Manager: who on the team logged in on a date (earliest login / latest
  // logout). Scoped copy of AuditService.presentOnDate.
  async teamPresent(manager_id: number, date: string) {
    const empIds = await this.assignedEmployeeIds(manager_id);
    if (!empIds.length) return [];
    return this.db('audit_logs as a')
      .innerJoin('employees', 'a.employee_id', 'employees.id')
      .leftJoin('departments', 'employees.department_id', 'departments.id')
      .whereRaw('DATE(a.created_at) = ?', [date])
      .whereIn('employees.id', empIds)
      .andWhere({ 'employees.is_active': true, 'employees.is_deleted': false })
      .whereExists(function () {
        this.select('*').from('audit_logs as a2')
          .whereRaw('a2.employee_id = a.employee_id')
          .andWhereRaw('DATE(a2.created_at) = ?', [date])
          .andWhere('a2.event_type', 'Login');
      })
      .groupBy('employees.id', 'employees.name', 'employees.email', 'employees.employee_code', 'departments.department_name')
      .select(
        'employees.id',
        'employees.name',
        'employees.email',
        'employees.employee_code',
        'departments.department_name',
        this.db.raw("MIN(CASE WHEN a.event_type = 'Login'  THEN a.created_at END) as first_login"),
        this.db.raw("MAX(CASE WHEN a.event_type = 'Logout' THEN a.created_at END) as last_logout"),
      )
      .orderByRaw("MIN(CASE WHEN a.event_type = 'Login' THEN a.created_at END) asc");
  }

  // Manager: team members who did NOT submit any task on a date.
  async teamPending(manager_id: number, date: string) {
    const empIds = await this.assignedEmployeeIds(manager_id);
    if (!empIds.length) return [];
    const submitted = await this.db('daily_tasks')
      .where('task_date', date)
      .andWhere('is_deleted', false)
      .whereIn('employee_id', empIds)
      .distinct('employee_id')
      .pluck('employee_id');
    return this.db('employees')
      .leftJoin('departments', 'employees.department_id', 'departments.id')
      .whereIn('employees.id', empIds)
      .andWhere({ 'employees.is_active': true, 'employees.is_deleted': false })
      .whereNotIn('employees.id', submitted.length ? submitted : [0])
      .select('employees.id', 'employees.name', 'employees.email', 'employees.employee_code', 'departments.department_name')
      .orderBy('employees.name');
  }

  // Manager: compliance — team members who logged tasks starting BEFORE their
  // first login on a date. Scoped copy of AuditService.loginMismatches.
  async teamCompliance(manager_id: number, date: string) {
    const empIds = await this.assignedEmployeeIds(manager_id);
    if (!empIds.length) return [];
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
      .whereIn('e.id', empIds)
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

  // Manager: task list over a date range, optionally filtered to one assigned
  // employee and/or project. Always restricted to the manager's team.
  async teamTasks(
    manager_id: number,
    q: { from?: string; to?: string; employee_id?: number; client_id?: number; project_id?: number; activity_id?: number },
  ) {
    const empIds = await this.assignedEmployeeIds(manager_id);
    if (!empIds.length) return [];
    return this.tasks.list(
      {
        from: q.from,
        to: q.to,
        employee_id: q.employee_id,
        client_id: q.client_id,
        project_id: q.project_id,
        activity_id: q.activity_id,
      } as any,
      { employee_ids: empIds },
    );
  }

  // Manager: task-logging permissions for the assigned team (backdate / log
  // anytime). Same flags the admin manages, scoped to the manager's employees.
  async teamPermissions(manager_id: number) {
    const empIds = await this.assignedEmployeeIds(manager_id);
    if (!empIds.length) return [];
    return this.db('employees')
      .leftJoin('departments', 'employees.department_id', 'departments.id')
      .whereIn('employees.id', empIds)
      .andWhere({ 'employees.is_active': true, 'employees.is_deleted': false })
      .select(
        'employees.id',
        'employees.name',
        'employees.email',
        'employees.employee_code',
        'departments.department_name',
        'employees.allow_backdated_tasks',
        'employees.allow_log_anytime',
      )
      .orderBy('employees.name');
  }

  // Manager: toggle a permission for ONE assigned employee. The team check is
  // the security boundary — a manager may only touch their own team.
  async setTeamPermission(manager_id: number, employee_id: number, dto: TeamPermissionDto) {
    const empIds = await this.assignedEmployeeIds(manager_id);
    if (!empIds.includes(employee_id)) {
      throw new ForbiddenException('Employee is not on your team');
    }
    const patch: Record<string, boolean> = {};
    if (dto.allow_backdated_tasks !== undefined) patch.allow_backdated_tasks = dto.allow_backdated_tasks;
    if (dto.allow_log_anytime !== undefined) patch.allow_log_anytime = dto.allow_log_anytime;
    if (Object.keys(patch).length) await this.db('employees').where({ id: employee_id }).update(patch);
    return this.db('employees')
      .where({ id: employee_id })
      .first('id', 'allow_backdated_tasks', 'allow_log_anytime');
  }
}

@Controller('managers')
@UseGuards(RolesGuard)
class ManagersController {
  constructor(private readonly s: ManagersService) {}

  private day(date?: string) {
    return date || new Date().toISOString().slice(0, 10);
  }

  // ----- Manager-only (scoped to the caller via JWT user.id) -----
  // Declared BEFORE the :id routes so "me" is never parsed as a numeric id.
  @Get('me/assignments')
  @Roles('Manager')
  myAssignments(@CurrentUser() user: AuthUser) {
    return this.s.getAssignments(user.id);
  }

  @Get('me/team/summary')
  @Roles('Manager')
  teamSummary(@CurrentUser() user: AuthUser, @Query('date') date?: string) {
    return this.s.teamSummary(user.id, this.day(date));
  }

  @Get('me/team/employee/:employeeId')
  @Roles('Manager')
  employeeDay(
    @CurrentUser() user: AuthUser,
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Query('date') date?: string,
  ) {
    return this.s.employeeDay(user.id, employeeId, this.day(date));
  }

  @Get('me/team/present')
  @Roles('Manager')
  present(@CurrentUser() user: AuthUser, @Query('date') date?: string) {
    return this.s.teamPresent(user.id, this.day(date));
  }

  @Get('me/team/pending')
  @Roles('Manager')
  pending(@CurrentUser() user: AuthUser, @Query('date') date?: string) {
    return this.s.teamPending(user.id, this.day(date));
  }

  @Get('me/team/compliance')
  @Roles('Manager')
  compliance(@CurrentUser() user: AuthUser, @Query('date') date?: string) {
    return this.s.teamCompliance(user.id, this.day(date));
  }

  @Get('me/team/tasks')
  @Roles('Manager')
  teamTasks(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('employee_id') employee_id?: string,
    @Query('client_id') client_id?: string,
    @Query('project_id') project_id?: string,
    @Query('activity_id') activity_id?: string,
  ) {
    return this.s.teamTasks(user.id, {
      from,
      to,
      employee_id: employee_id ? Number(employee_id) : undefined,
      client_id: client_id ? Number(client_id) : undefined,
      project_id: project_id ? Number(project_id) : undefined,
      activity_id: activity_id ? Number(activity_id) : undefined,
    });
  }

  @Get('me/team/permissions')
  @Roles('Manager')
  teamPermissions(@CurrentUser() user: AuthUser) {
    return this.s.teamPermissions(user.id);
  }

  @Patch('me/team/permissions/:employeeId')
  @Roles('Manager')
  setTeamPermission(
    @CurrentUser() user: AuthUser,
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Body() dto: TeamPermissionDto,
  ) {
    return this.s.setTeamPermission(user.id, employeeId, dto);
  }

  // ----- Admin-only management -----
  @Get()
  @Roles('Admin')
  list() {
    return this.s.listManagers();
  }

  @Get(':id/assignments')
  @Roles('Admin')
  assignments(@Param('id', ParseIntPipe) id: number) {
    return this.s.getAssignments(id);
  }

  @Put(':id/assignments')
  @Roles('Admin')
  setAssignments(@Param('id', ParseIntPipe) id: number, @Body() dto: SetAssignmentsDto) {
    return this.s.setAssignments(id, dto);
  }
}

@Module({
  imports: [DailyTasksModule],
  controllers: [ManagersController],
  providers: [ManagersService],
})
export class ManagersModule {}

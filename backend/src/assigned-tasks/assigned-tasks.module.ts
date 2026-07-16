import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Inject,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Knex } from 'knex';
import { KNEX_CONNECTION } from '../database/knex.module';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { NotificationsModule, NotificationsService } from '../notifications/notifications.module';
import { assignedTaskEmail, AssignedTaskEmailData } from '../email/templates';

export const TASK_STATUSES = ['Open', 'In Progress', 'Completed'] as const;
export const TASK_PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'] as const;

class CreateAssignedTaskDto {
  @IsString() @MaxLength(255) title: string;
  @IsOptional() @IsString() description?: string;
  // One task is created per assignee, so each person tracks their own copy.
  @IsArray() @IsInt({ each: true }) assignee_ids: number[];
  @IsOptional() @IsInt() client_id?: number;
  @IsOptional() @IsInt() project_id?: number;
  @IsOptional() @IsIn(TASK_PRIORITIES as unknown as string[]) priority?: string;
  @IsOptional() @IsDateString() assigned_date?: string;
  @IsOptional() @IsDateString() start_date?: string;
  @IsOptional() @IsDateString() due_date?: string;
}

class UpdateAssignedTaskDto {
  @IsOptional() @IsString() @MaxLength(255) title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsInt() assignee_id?: number;
  @IsOptional() @IsInt() client_id?: number;
  @IsOptional() @IsInt() project_id?: number;
  @IsOptional() @IsIn(TASK_PRIORITIES as unknown as string[]) priority?: string;
  @IsOptional() @IsDateString() assigned_date?: string;
  @IsOptional() @IsDateString() start_date?: string;
  @IsOptional() @IsDateString() due_date?: string;
}

class StatusDto {
  @IsIn(TASK_STATUSES as unknown as string[]) status: string;
}

class CommentDto {
  @IsString() body: string;
  @IsOptional() @IsArray() @IsInt({ each: true }) mentions?: number[];
}

@Injectable()
class AssignedTasksService {
  constructor(
    @Inject(KNEX_CONNECTION) private readonly db: Knex,
    private readonly notify: NotificationsService,
  ) {}

  // The employee ids on a manager's team. A manager may only assign to and
  // manage tasks for these employees (plus themselves).
  private async teamIds(manager_id: number): Promise<number[]> {
    const ids = await this.db('manager_employees')
      .join('employees', 'manager_employees.employee_id', 'employees.id')
      .where('manager_employees.manager_id', manager_id)
      .andWhere('employees.is_deleted', false)
      .pluck('manager_employees.employee_id');
    return [...ids, manager_id];
  }

  // Can `user` assign to / manage tasks for `assignee_id`?
  private async canAssignTo(user: AuthUser, assignee_id: number): Promise<boolean> {
    if (user.role === 'Admin') return true;
    if (user.role === 'Manager') return (await this.teamIds(user.id)).includes(assignee_id);
    return false;
  }

  // The people `user` is allowed to assign to: admins get everyone, a manager
  // gets their own team plus themselves. Mirrors canAssignTo() so the picker
  // can never offer someone create() would reject.
  async assignees(user: AuthUser) {
    const q = this.db('employees')
      .where('is_deleted', false)
      .orderBy('name', 'asc')
      .select('id', 'name', 'employee_code');
    if (user.role === 'Admin') return q;
    if (user.role === 'Manager') return q.whereIn('id', await this.teamIds(user.id));
    return [];
  }

  private baseQuery() {
    return this.db('assigned_tasks as t')
      .leftJoin('employees as ae', 't.assignee_id', 'ae.id')
      .leftJoin('employees as ab', 't.assigned_by_id', 'ab.id')
      .leftJoin('clients as c', 't.client_id', 'c.id')
      .leftJoin('projects as p', 't.project_id', 'p.id')
      .where('t.is_deleted', false)
      .select(
        't.*',
        'ae.name as assignee_name',
        'ae.employee_code as assignee_code',
        'ab.name as assigned_by_name',
        'c.client_name',
        'p.project_name',
        'p.project_code',
      );
  }

  // Admin/Manager list of assigned tasks with filters. An admin sees every
  // task, including ones managers assigned. A manager sees only the tasks they
  // assigned themselves — tasks an admin handed to their team members (or to
  // the manager) stay out of this list; the manager's own show up in My Tasks.
  async list(
    user: AuthUser,
    q: {
      assignee_id?: string;
      client_id?: string;
      project_id?: string;
      status?: string;
      priority?: string;
      search?: string;
      from?: string;
      to?: string;
    },
  ) {
    let query = this.baseQuery().orderBy('t.created_at', 'desc');

    if (user.role === 'Manager') query = query.andWhere('t.assigned_by_id', user.id);

    if (q.assignee_id) query = query.whereIn('t.assignee_id', q.assignee_id.split(',').map(Number));
    if (q.client_id) query = query.whereIn('t.client_id', q.client_id.split(',').map(Number));
    if (q.project_id) query = query.whereIn('t.project_id', q.project_id.split(',').map(Number));
    if (q.status) query = query.whereIn('t.status', q.status.split(','));
    if (q.priority) query = query.whereIn('t.priority', q.priority.split(','));
    if (q.from) query = query.andWhere('t.assigned_date', '>=', q.from);
    if (q.to) query = query.andWhere('t.assigned_date', '<=', q.to);
    if (q.search) {
      const s = `%${q.search}%`;
      query = query.andWhere((b) =>
        b.where('t.title', 'like', s)
          .orWhere('t.description', 'like', s)
          .orWhere('t.employee_type', 'like', s)
          .orWhere('t.status', 'like', s)
          .orWhere('t.priority', 'like', s)
          .orWhere('ae.name', 'like', s)
          .orWhere('ae.employee_code', 'like', s)
          .orWhere('ab.name', 'like', s)
          .orWhere('c.client_name', 'like', s)
          .orWhere('p.project_name', 'like', s)
          .orWhere('p.project_code', 'like', s),
      );
    }
    return query;
  }

  // The current user's own assigned-to-me tasks (the "to do" list).
  myTasks(user: AuthUser, status?: string) {
    let q = this.baseQuery().andWhere('t.assignee_id', user.id).orderByRaw(
      "FIELD(t.status,'Open','In Progress','Completed'), t.due_date is null, t.due_date asc",
    );
    if (status) q = q.whereIn('t.status', status.split(','));
    return q;
  }

  // Explicitly acknowledge a task as the assignee. Deliberately NOT folded into
  // findOne(): an admin/assigner reviewing the same task in Assign Tasks must
  // never clear the assignee's "new" flag — and when the assigner and assignee
  // are the same person, the create() → findOne() round-trip would otherwise
  // mark the task seen the moment it was created.
  async markSeen(user: AuthUser, id: number) {
    const task = await this.db('assigned_tasks').where({ id, is_deleted: false }).first();
    if (!task) throw new NotFoundException('Task not found');
    if (task.assignee_id !== user.id) throw new ForbiddenException('Not your task');
    if (!task.seen_at) {
      await this.db('assigned_tasks').where({ id }).update({ seen_at: this.db.fn.now() });
    }
    return { ok: true };
  }

  // How many of my tasks I've never opened — the sidebar/dashboard dot.
  async unseenCount(user: AuthUser) {
    const row = await this.db('assigned_tasks')
      .where({ assignee_id: user.id, is_deleted: false })
      .whereNull('seen_at')
      .count({ c: 'id' })
      .first();
    return { count: Number(row?.c || 0) };
  }

  async findOne(user: AuthUser, id: number) {
    const task = await this.baseQuery().andWhere('t.id', id).first();
    if (!task) throw new NotFoundException('Task not found');
    await this.assertCanView(user, task);
    const comments = await this.db('assigned_task_comments as c')
      .leftJoin('employees as e', 'c.author_id', 'e.id')
      .where('c.task_id', id)
      .andWhere((qb) => qb.where('c.is_deleted', false).orWhereNull('c.is_deleted'))
      .orderBy('c.created_at', 'asc')
      .select('c.*', 'e.name as author_name');
    // Resolve @mention ids → names so the thread can show "@Name" chips.
    const mentionIds = [
      ...new Set(comments.flatMap((c: any) => (c.mentions ? String(c.mentions).split(',').map(Number) : []))),
    ].filter(Boolean);
    if (mentionIds.length) {
      const people = await this.db('employees').whereIn('id', mentionIds).select('id', 'name');
      const nameById = new Map<number, string>(people.map((p: any) => [p.id, p.name]));
      for (const c of comments as any[]) {
        c.mention_names = c.mentions
          ? String(c.mentions).split(',').map((x) => nameById.get(Number(x))).filter(Boolean)
          : [];
      }
    } else {
      for (const c of comments as any[]) c.mention_names = [];
    }
    const activity = await this.db('assigned_task_activity as a')
      .leftJoin('employees as e', 'a.actor_id', 'e.id')
      .where('a.task_id', id)
      .orderBy('a.created_at', 'desc')
      .select('a.*', 'e.name as actor_name');
    return { ...task, comments, activity };
  }

  // Mirrors list(): an admin can open anything, everyone else only the tasks
  // they assigned or were assigned. A manager has no claim on a task an admin
  // gave to one of their team members.
  private assertCanView(user: AuthUser, task: any) {
    if (user.role === 'Admin') return;
    if (task.assignee_id === user.id || task.assigned_by_id === user.id) return;
    throw new ForbiddenException('You cannot access this task');
  }

  // Full joined row reduced to the fields the email template needs.
  private async taskEmailData(id: number): Promise<AssignedTaskEmailData> {
    const r = await this.baseQuery().andWhere('t.id', id).first();
    return {
      title: r.title,
      description: r.description,
      assignee_name: r.assignee_name,
      assigned_by_name: r.assigned_by_name,
      priority: r.priority,
      status: r.status,
      client_name: r.client_name,
      project_name: r.project_name,
      assigned_date: r.assigned_date,
      start_date: r.start_date,
      due_date: r.due_date,
    };
  }

  private async empName(id?: number | null) {
    if (!id) return '—';
    const r = await this.db('employees').where({ id }).first('name');
    return r?.name || '—';
  }

  // Render a field's stored value as a human-readable label for the timeline.
  private async displayValue(field: string, value: any): Promise<string> {
    if (value === null || value === undefined || value === '') return '—';
    if (field === 'client_id') {
      const r = await this.db('clients').where({ id: value }).first('client_name');
      return r?.client_name || '—';
    }
    if (field === 'project_id') {
      const r = await this.db('projects').where({ id: value }).first('project_name');
      return r?.project_name || '—';
    }
    return String(value);
  }

  // Append one entry to a task's activity timeline (who did what, when).
  // Values are clamped to the column widths (varchar 255 / 500) so a long
  // title/description edit can't overflow and fail the whole update.
  private logActivity(
    task_id: number,
    actor_id: number,
    type: string,
    extra?: { from?: string | null; to?: string | null; note?: string },
  ) {
    const clamp = (v: string | null | undefined, max: number) =>
      v == null ? null : v.length > max ? `${v.slice(0, max - 1)}…` : v;
    return this.db('assigned_task_activity').insert({
      task_id,
      actor_id,
      type,
      from_value: clamp(extra?.from, 255),
      to_value: clamp(extra?.to, 255),
      note: clamp(extra?.note, 500),
    });
  }

  async create(user: AuthUser, dto: CreateAssignedTaskDto) {
    const assigneeIds = [...new Set(dto.assignee_ids || [])];
    if (!assigneeIds.length) throw new BadRequestException('Select at least one assignee');
    for (const aid of assigneeIds) {
      if (!(await this.canAssignTo(user, aid))) {
        throw new ForbiddenException('You can only assign tasks to your own team');
      }
    }

    // One independent task per selected employee.
    let lastId = 0;
    for (const aid of assigneeIds) {
      const assignee = await this.db('employees').where({ id: aid, is_deleted: false }).first('id', 'name');
      if (!assignee) throw new BadRequestException('Assignee does not exist');

      const [id] = await this.db('assigned_tasks').insert({
        title: dto.title,
        description: dto.description ?? null,
        assignee_id: aid,
        assigned_by_id: user.id,
        client_id: dto.client_id ?? null,
        project_id: dto.project_id ?? null,
        priority: dto.priority || 'Medium',
        assigned_date: dto.assigned_date || new Date().toISOString().slice(0, 10),
        start_date: dto.start_date ?? null,
        due_date: dto.due_date ?? null,
        status: 'Open',
      });
      lastId = id;

      await this.logActivity(id, user.id, 'Created', { to: assignee.name, note: 'Task created' });
      await this.notify.create({
        recipient_id: aid,
        type: 'Assignment',
        title: `New task assigned: ${dto.title}`,
        body: dto.due_date ? `Due ${dto.due_date}` : undefined,
        link: '/my-tasks',
        task_id: id,
        email: {
          type: 'Task Assignment',
          subject: `New task assigned: ${dto.title}`,
          html: assignedTaskEmail({ headline: 'A new task has been assigned to you', task: await this.taskEmailData(id) }),
        },
      });
    }

    return this.findOne(user, lastId);
  }

  async update(user: AuthUser, id: number, dto: UpdateAssignedTaskDto) {
    const task = await this.db('assigned_tasks').where({ id, is_deleted: false }).first();
    if (!task) throw new NotFoundException('Task not found');
    // Only an admin or the person who assigned the task may edit it.
    if (user.role !== 'Admin' && task.assigned_by_id !== user.id) {
      throw new ForbiddenException('You cannot edit this task');
    }
    if (dto.assignee_id && dto.assignee_id !== task.assignee_id) {
      if (!(await this.canAssignTo(user, dto.assignee_id))) {
        throw new ForbiddenException('You can only reassign to your own team');
      }
    }
    const FIELD_LABELS: Record<string, string> = {
      title: 'Title', description: 'Description', priority: 'Priority',
      client_id: 'Client', project_id: 'Project', assigned_date: 'Assigned date',
      start_date: 'Start date', due_date: 'Due date',
    };
    // Only patch fields that actually changed — keeps the timeline noise-free.
    const patch: Record<string, any> = {};
    for (const k of ['title', 'description', 'assignee_id', 'client_id', 'project_id', 'priority', 'assigned_date', 'start_date', 'due_date'] as const) {
      if (dto[k] !== undefined && String(task[k] ?? '') !== String(dto[k] ?? '')) patch[k] = dto[k];
    }
    if (Object.keys(patch).length) await this.db('assigned_tasks').where({ id }).update(patch);

    // One activity entry per changed field, with the old → new value.
    for (const [field, value] of Object.entries(patch)) {
      if (field === 'assignee_id') {
        await this.logActivity(id, user.id, 'Reassigned', {
          from: await this.empName(task.assignee_id),
          to: await this.empName(value as number),
        });
      } else {
        await this.logActivity(id, user.id, 'Updated', {
          note: FIELD_LABELS[field] || field,
          from: await this.displayValue(field, task[field]),
          to: await this.displayValue(field, value),
        });
      }
    }

    if (patch.assignee_id) {
      // New owner — the task is "new" again for them.
      await this.db('assigned_tasks').where({ id }).update({ seen_at: null });
      await this.notify.create({
        recipient_id: dto.assignee_id,
        type: 'Assignment',
        title: `Task assigned to you: ${dto.title || task.title}`,
        link: '/my-tasks',
        task_id: id,
        email: {
          type: 'Task Assignment',
          subject: `Task assigned to you: ${dto.title || task.title}`,
          html: assignedTaskEmail({ headline: 'A task has been assigned to you', task: await this.taskEmailData(id) }),
        },
      });
    }
    return this.findOne(user, id);
  }

  async setStatus(user: AuthUser, id: number, status: string) {
    const task = await this.db('assigned_tasks').where({ id, is_deleted: false }).first();
    if (!task) throw new NotFoundException('Task not found');
    await this.assertCanView(user, task);
    if (status === task.status) return this.findOne(user, id);

    await this.db('assigned_tasks').where({ id }).update({
      status,
      completed_at: status === 'Completed' ? this.db.fn.now() : null,
    });

    await this.logActivity(id, user.id, 'StatusChanged', { from: task.status, to: status });

    // Notify the assigner (and the assignee if someone else changed it).
    const recipients = [task.assigned_by_id];
    if (user.id !== task.assignee_id) recipients.push(task.assignee_id);
    await this.notify.createMany(
      recipients,
      {
        type: 'StatusChange',
        title: `Task "${task.title}" → ${status}`,
        link: '/assign-tasks',
        task_id: id,
        email: {
          type: 'Task Status',
          subject: `Task status updated: ${task.title}`,
          html: assignedTaskEmail({
            headline: `Status changed to ${status}`,
            task: await this.taskEmailData(id),
            note: { label: 'Status update', body: `${task.status} → ${status} (by ${await this.empName(user.id)})` },
          }),
        },
      },
      user.id,
    );
    return this.findOne(user, id);
  }

  async remove(user: AuthUser, id: number) {
    const task = await this.db('assigned_tasks').where({ id, is_deleted: false }).first();
    if (!task) throw new NotFoundException('Task not found');
    if (user.role !== 'Admin' && task.assigned_by_id !== user.id) {
      throw new ForbiddenException('Only an admin or the assigner can delete this task');
    }
    await this.db('assigned_tasks').where({ id }).update({ is_deleted: true, is_active: false });
    return { ok: true };
  }

  async addComment(user: AuthUser, id: number, dto: CommentDto) {
    const task = await this.db('assigned_tasks').where({ id, is_deleted: false }).first();
    if (!task) throw new NotFoundException('Task not found');
    await this.assertCanView(user, task);

    const mentions = [...new Set(dto.mentions || [])];
    await this.db('assigned_task_comments').insert({
      task_id: id,
      author_id: user.id,
      body: dto.body,
      mentions: mentions.length ? mentions.join(',') : null,
    });

    await this.logActivity(id, user.id, 'Commented', { note: dto.body.slice(0, 200) });

    const emailHtml = assignedTaskEmail({
      headline: 'New comment on a task',
      task: await this.taskEmailData(id),
      note: { label: `Comment from ${await this.empName(user.id)}`, body: dto.body },
    });

    if (mentions.length) {
      // Comment with @mentions → notify ONLY the mentioned people.
      await this.notify.createMany(
        mentions,
        {
          type: 'Mention',
          title: `You were mentioned on "${task.title}"`,
          body: dto.body.slice(0, 140),
          link: '/my-tasks',
          task_id: id,
          email: { type: 'Task Comment', subject: `You were mentioned: ${task.title}`, html: emailHtml },
        },
        user.id,
      );
    } else {
      // Plain comment → notify everyone on the task (assignee + assigner).
      await this.notify.createMany(
        [task.assignee_id, task.assigned_by_id],
        {
          type: 'Comment',
          title: `New comment on "${task.title}"`,
          body: dto.body.slice(0, 140),
          link: task.assignee_id === user.id ? '/my-tasks' : '/assign-tasks',
          task_id: id,
          email: { type: 'Task Comment', subject: `New comment: ${task.title}`, html: emailHtml },
        },
        user.id,
      );
    }
    return this.findOne(user, id);
  }

  // Edit a comment — author only. Stamps edited_at so the UI shows "edited".
  async editComment(user: AuthUser, taskId: number, commentId: number, body: string) {
    const task = await this.db('assigned_tasks').where({ id: taskId, is_deleted: false }).first();
    if (!task) throw new NotFoundException('Task not found');
    await this.assertCanView(user, task);
    const text = String(body || '').trim();
    if (!text) throw new BadRequestException('Comment cannot be empty.');
    const row = await this.db('assigned_task_comments').where({ id: commentId, task_id: taskId }).first('id', 'author_id', 'is_deleted');
    if (!row || row.is_deleted) throw new NotFoundException('Comment not found');
    if (row.author_id !== user.id) throw new ForbiddenException('You can only edit your own comment.');
    await this.db('assigned_task_comments').where({ id: commentId }).update({ body: text, edited_at: this.db.fn.now() });
    return this.findOne(user, taskId);
  }

  // Delete a comment — the author, or an admin (moderation).
  async deleteComment(user: AuthUser, taskId: number, commentId: number) {
    const task = await this.db('assigned_tasks').where({ id: taskId, is_deleted: false }).first();
    if (!task) throw new NotFoundException('Task not found');
    await this.assertCanView(user, task);
    const row = await this.db('assigned_task_comments').where({ id: commentId, task_id: taskId }).first('id', 'author_id', 'is_deleted');
    if (!row || row.is_deleted) throw new NotFoundException('Comment not found');
    if (user.role !== 'Admin' && row.author_id !== user.id) {
      throw new ForbiddenException('You can only delete your own comment.');
    }
    await this.db('assigned_task_comments').where({ id: commentId }).update({ is_deleted: true });
    return this.findOne(user, taskId);
  }
}

@Controller('assigned-tasks')
@UseGuards(RolesGuard)
class AssignedTasksController {
  constructor(private readonly s: AssignedTasksService) {}

  // Current user's own to-do list — open to all logging roles.
  @Get('mine')
  mine(@CurrentUser() user: AuthUser, @Query('status') status?: string) {
    return this.s.myTasks(user, status);
  }

  // Called from My Tasks / the dashboard card when the assignee opens a task.
  @Patch(':id/seen')
  seen(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.s.markSeen(user, id);
  }

  @Get('mine/unseen-count')
  unseen(@CurrentUser() user: AuthUser) {
    return this.s.unseenCount(user);
  }

  // Employees this user may assign to — declared before `:id` so the literal
  // path isn't swallowed by the param route.
  @Get('assignees')
  @Roles('Admin', 'Manager')
  assignees(@CurrentUser() user: AuthUser) {
    return this.s.assignees(user);
  }

  @Get()
  @Roles('Admin', 'Manager')
  list(
    @CurrentUser() user: AuthUser,
    @Query('assignee_id') assignee_id?: string,
    @Query('client_id') client_id?: string,
    @Query('project_id') project_id?: string,
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('search') search?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.s.list(user, { assignee_id, client_id, project_id, status, priority, search, from, to });
  }

  @Get(':id')
  one(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.s.findOne(user, id);
  }

  @Post()
  @Roles('Admin', 'Manager')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAssignedTaskDto) {
    return this.s.create(user, dto);
  }

  @Put(':id')
  @Roles('Admin', 'Manager')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAssignedTaskDto) {
    return this.s.update(user, id, dto);
  }

  @Patch(':id/status')
  setStatus(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: StatusDto) {
    return this.s.setStatus(user, id, dto.status);
  }

  @Post(':id/comments')
  comment(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: CommentDto) {
    return this.s.addComment(user, id, dto);
  }

  @Put(':id/comments/:commentId')
  editComment(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('commentId', ParseIntPipe) commentId: number,
    @Body('body') body: string,
  ) {
    return this.s.editComment(user, id, commentId, body);
  }

  @Delete(':id/comments/:commentId')
  deleteComment(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('commentId', ParseIntPipe) commentId: number,
  ) {
    return this.s.deleteComment(user, id, commentId);
  }

  @Delete(':id')
  @Roles('Admin', 'Manager')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.s.remove(user, id);
  }
}

@Module({
  imports: [NotificationsModule],
  controllers: [AssignedTasksController],
  providers: [AssignedTasksService],
})
export class AssignedTasksModule {}

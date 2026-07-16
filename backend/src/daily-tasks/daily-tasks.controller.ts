import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { getRequestContext } from '../common/utils/request-context';
import { CreateDailyTaskDto, ListDailyTasksDto, UpdateDailyTaskDto } from './dto/daily-task.dto';
import { DailyTasksService } from './daily-tasks.service';

@Controller('daily-tasks')
@UseGuards(RolesGuard)
export class DailyTasksController {
  constructor(private readonly service: DailyTasksService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: ListDailyTasksDto) {
    const scope = user.role === 'Admin' ? {} : { employee_id: user.id };
    return this.service.list(q, scope);
  }

  @Get('my/today')
  myToday(@CurrentUser() user: AuthUser) {
    const today = new Date().toISOString().slice(0, 10);
    return this.service.getEmployeeReport(user.id, today);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  // Comment thread on a daily task. Admin can comment on any employee's task;
  // an employee only on their own (enforced in the service).
  @Get(':id/comments')
  listComments(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.service.listComments(id, user);
  }

  @Post(':id/comments')
  addComment(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body('body') body: string,
  ) {
    return this.service.addComment(id, user, body);
  }

  @Put(':id/comments/:commentId')
  editComment(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('commentId', ParseIntPipe) commentId: number,
    @Body('body') body: string,
  ) {
    return this.service.editComment(id, commentId, user, body);
  }

  @Delete(':id/comments/:commentId')
  deleteComment(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('commentId', ParseIntPipe) commentId: number,
  ) {
    return this.service.deleteComment(id, commentId, user);
  }

  @Post()
  @Roles('Employee', 'Manager')
  create(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Body() dto: CreateDailyTaskDto,
  ) {
    return this.service.create(user.id, getRequestContext(req), dto);
  }

  @Put(':id')
  @Roles('Employee', 'Manager')
  update(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDailyTaskDto,
  ) {
    return this.service.update(id, user, dto, getRequestContext(req));
  }

  @Delete(':id')
  @Roles('Employee', 'Manager')
  remove(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.remove(id, user, getRequestContext(req));
  }

  // Admin: pending submission report
  @Get('admin/pending')
  @Roles('Admin')
  pending(@Query('date') date?: string) {
    return this.service.list({ submission_status: 'Pending', from: date, to: date });
  }
}

import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { ReportsService } from './reports.service';

function defaultDate(date?: string) {
  return date || new Date().toISOString().slice(0, 10);
}

function weekRange(d = new Date()) {
  const day = d.getDay(); // 0 Sun ... 6 Sat
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((day + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { from: monday.toISOString().slice(0, 10), to: sunday.toISOString().slice(0, 10) };
}

function monthRange(d = new Date()) {
  const from = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
  const to = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
  return { from, to };
}

@Controller('reports')
@UseGuards(RolesGuard)
@Roles('Admin')
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Get('daily')
  daily(@Query('date') date?: string, @Query('type') type?: string) {
    const d = defaultDate(date);
    switch (type) {
      case 'client': return this.service.clientDaily(d);
      case 'project': return this.service.projectDaily(d);
      case 'pending': return this.service.pendingSubmissions(d);
      case 'activity': return this.service.activityDaily(d);
      default: return this.service.employeeDaily(d);
    }
  }

  @Get('weekly')
  weekly(@Query('from') from?: string, @Query('to') to?: string) {
    const range = from && to ? { from, to } : weekRange();
    return this.service.weekly(range);
  }

  @Get('monthly')
  monthly(@Query('from') from?: string, @Query('to') to?: string) {
    const range = from && to ? { from, to } : monthRange();
    return this.service.monthly(range);
  }
}

import { Controller, ForbiddenException, Get, Headers } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { SchedulerService } from './scheduler.service';

/**
 * HTTP triggers for the scheduled jobs, used by Vercel Cron (serverless has no
 * long-running process, so the @Cron timers in SchedulerService never fire there).
 * Every route is public to the JWT guard but protected by a shared secret:
 * Vercel automatically sends `Authorization: Bearer ${CRON_SECRET}` when the
 * CRON_SECRET env var is set on the project.
 */
@ApiExcludeController()
@Controller('internal/cron')
export class CronController {
  constructor(private readonly scheduler: SchedulerService) {}

  private assertSecret(auth?: string) {
    const secret = process.env.CRON_SECRET;
    if (!secret || auth !== `Bearer ${secret}`) {
      throw new ForbiddenException('Invalid cron secret');
    }
  }

  @Public()
  @Get('daily-report')
  async dailyReport(@Headers('authorization') auth?: string) {
    this.assertSecret(auth);
    await this.scheduler.sendDailyEmployeeReports();
    return { ok: true, job: 'daily-report' };
  }

  @Public()
  @Get('pending-reminder')
  async pendingReminder(@Headers('authorization') auth?: string) {
    this.assertSecret(auth);
    await this.scheduler.sendPendingReminders();
    return { ok: true, job: 'pending-reminder' };
  }

  @Public()
  @Get('weekly-summary')
  async weeklySummary(@Headers('authorization') auth?: string) {
    this.assertSecret(auth);
    await this.scheduler.weeklyAdminSummary();
    return { ok: true, job: 'weekly-summary' };
  }

  @Public()
  @Get('monthly-summary')
  async monthlySummary(@Headers('authorization') auth?: string) {
    this.assertSecret(auth);
    await this.scheduler.monthlyAdminSummary();
    return { ok: true, job: 'monthly-summary' };
  }
}

import { Module } from '@nestjs/common';
import { DailyTasksModule } from '../daily-tasks/daily-tasks.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { HolidaysModule } from '../holidays/holidays.module';
import { CronController } from './cron.controller';
import { SchedulerService } from './scheduler.service';

@Module({
  imports: [DailyTasksModule, NotificationsModule, HolidaysModule],
  controllers: [CronController],
  providers: [SchedulerService],
})
export class SchedulerModule {}

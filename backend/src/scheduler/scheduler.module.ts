import { Module } from '@nestjs/common';
import { DailyTasksModule } from '../daily-tasks/daily-tasks.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CronController } from './cron.controller';
import { SchedulerService } from './scheduler.service';

@Module({
  imports: [DailyTasksModule, NotificationsModule],
  controllers: [CronController],
  providers: [SchedulerService],
})
export class SchedulerModule {}

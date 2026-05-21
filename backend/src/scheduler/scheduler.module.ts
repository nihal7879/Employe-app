import { Module } from '@nestjs/common';
import { DailyTasksModule } from '../daily-tasks/daily-tasks.module';
import { SchedulerService } from './scheduler.service';

@Module({
  imports: [DailyTasksModule],
  providers: [SchedulerService],
})
export class SchedulerModule {}

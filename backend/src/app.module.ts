import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ActivitiesModule } from './activities/activities.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { ClientsModule } from './clients/clients.module';
import { ConfigModule as AppSettingsModule } from './config/config.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { DailyTasksModule } from './daily-tasks/daily-tasks.module';
import { KnexModule } from './database/knex.module';
import { DepartmentsModule } from './departments/departments.module';
import { EmailModule } from './email/email.module';
import { EmailLogsModule } from './email/email-logs.module';
import { EmployeesModule } from './employees/employees.module';
import { HealthController } from './health/health.controller';
import { ManagersModule } from './managers/managers.module';
import { AssignedTasksModule } from './assigned-tasks/assigned-tasks.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ProjectsModule } from './projects/projects.module';
import { ReportsModule } from './reports/reports.module';
import { RolesModule } from './roles/roles.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { InboxModule } from './inbox/inbox.module';
import { HolidaysModule } from './holidays/holidays.module';
import { NoticesModule } from './notices/notices.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    KnexModule,
    EmailModule,
    EmailLogsModule,
    AuthModule,
    RolesModule,
    DepartmentsModule,
    EmployeesModule,
    ManagersModule,
    ClientsModule,
    ProjectsModule,
    ActivitiesModule,
    DailyTasksModule,
    AssignedTasksModule,
    NotificationsModule,
    ReportsModule,
    AnalyticsModule,
    AuditModule,
    SchedulerModule,
    InboxModule,
    HolidaysModule,
    NoticesModule,
    AppSettingsModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AppModule {}

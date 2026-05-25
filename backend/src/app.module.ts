import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ActivitiesModule } from './activities/activities.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AuthModule } from './auth/auth.module';
import { ClientsModule } from './clients/clients.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { DailyTasksModule } from './daily-tasks/daily-tasks.module';
import { KnexModule } from './database/knex.module';
import { DepartmentsModule } from './departments/departments.module';
import { EmailModule } from './email/email.module';
import { EmailLogsModule } from './email/email-logs.module';
import { EmployeesModule } from './employees/employees.module';
import { HealthController } from './health/health.controller';
import { ProjectsModule } from './projects/projects.module';
import { ReportsModule } from './reports/reports.module';
import { RolesModule } from './roles/roles.module';
import { SchedulerModule } from './scheduler/scheduler.module';

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
    ClientsModule,
    ProjectsModule,
    ActivitiesModule,
    DailyTasksModule,
    ReportsModule,
    AnalyticsModule,
    SchedulerModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AppModule {}

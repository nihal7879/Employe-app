import { IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export const PROGRESS_STATUSES = ['Completed', 'In Progress', 'Pending'] as const;
export type ProgressStatus = (typeof PROGRESS_STATUSES)[number];

export class CreateDailyTaskDto {
  // Client/project are optional — meeting-type activities (e.g. General Meeting)
  // aren't tied to a specific client or project. The DB columns are nullable.
  @IsOptional() @IsInt() client_id?: number;
  @IsOptional() @IsInt() project_id?: number;
  @IsInt() activity_id: number;
  @IsNumber() @Min(0) @Max(24) hours_spent: number;
  @IsString() @MaxLength(255) task_title: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() @MaxLength(255) assigned_by?: string;
  @IsOptional() @IsString() @MaxLength(255) reference?: string;
  @IsDateString() task_date: string;
  @IsOptional() @IsString() start_time?: string;
  @IsOptional() @IsString() end_time?: string;
  @IsOptional() @IsString() remarks?: string;
  @IsOptional() @IsString() submission_status?: string;
  @IsIn(PROGRESS_STATUSES as unknown as string[]) progress_status: ProgressStatus;
}

export class UpdateDailyTaskDto {
  @IsOptional() @IsInt() client_id?: number;
  @IsOptional() @IsInt() project_id?: number;
  @IsOptional() @IsInt() activity_id?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(24) hours_spent?: number;
  @IsOptional() @IsString() task_title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() @MaxLength(255) assigned_by?: string;
  @IsOptional() @IsString() @MaxLength(255) reference?: string;
  @IsOptional() @IsDateString() task_date?: string;
  @IsOptional() @IsString() start_time?: string;
  @IsOptional() @IsString() end_time?: string;
  @IsOptional() @IsString() remarks?: string;
  @IsOptional() @IsString() submission_status?: string;
  @IsOptional() @IsIn(PROGRESS_STATUSES as unknown as string[]) progress_status?: ProgressStatus;
}

export class ListDailyTasksDto {
  // These accept a single id or a comma-separated list (e.g. "1,2,3") so the
  // reports drilldown can filter by multiple employees/clients/projects/
  // activities at once. The service normalizes them into number arrays.
  @IsOptional() @IsString() employee_id?: string;
  @IsOptional() @IsString() client_id?: string;
  @IsOptional() @IsString() project_id?: string;
  @IsOptional() @IsString() activity_id?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsString() submission_status?: string;
  @IsOptional() @IsIn(PROGRESS_STATUSES as unknown as string[]) progress_status?: ProgressStatus;
}

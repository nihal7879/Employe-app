import { IsDateString, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateDailyTaskDto {
  @IsInt() client_id: number;
  @IsInt() project_id: number;
  @IsInt() activity_id: number;
  @IsNumber() @Min(0) @Max(24) hours_spent: number;
  @IsString() @MaxLength(255) task_title: string;
  @IsOptional() @IsString() description?: string;
  @IsDateString() task_date: string;
  @IsOptional() @IsString() start_time?: string;
  @IsOptional() @IsString() end_time?: string;
  @IsOptional() @IsString() remarks?: string;
  @IsOptional() @IsString() submission_status?: string;
}

export class UpdateDailyTaskDto {
  @IsOptional() @IsInt() client_id?: number;
  @IsOptional() @IsInt() project_id?: number;
  @IsOptional() @IsInt() activity_id?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(24) hours_spent?: number;
  @IsOptional() @IsString() task_title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsDateString() task_date?: string;
  @IsOptional() @IsString() start_time?: string;
  @IsOptional() @IsString() end_time?: string;
  @IsOptional() @IsString() remarks?: string;
  @IsOptional() @IsString() submission_status?: string;
}

export class ListDailyTasksDto {
  @IsOptional() @IsInt() employee_id?: number;
  @IsOptional() @IsInt() client_id?: number;
  @IsOptional() @IsInt() project_id?: number;
  @IsOptional() @IsInt() activity_id?: number;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsString() submission_status?: string;
}

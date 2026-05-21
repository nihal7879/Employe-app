import { IsBoolean, IsDateString, IsEmail, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateEmployeeDto {
  @IsString() @MaxLength(50) employee_code: string;
  @IsString() @MaxLength(150) name: string;
  @IsEmail() email: string;
  @IsInt() role_id: number;
  @IsInt() department_id: number;
  @IsOptional() @IsString() designation?: string;
  @IsOptional() @IsDateString() joining_date?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() profile_image?: string;
}

export class UpdateEmployeeDto {
  @IsOptional() @IsString() employee_code?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsInt() role_id?: number;
  @IsOptional() @IsInt() department_id?: number;
  @IsOptional() @IsString() designation?: string;
  @IsOptional() @IsDateString() joining_date?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() profile_image?: string;
  @IsOptional() @IsBoolean() is_active?: boolean;
}

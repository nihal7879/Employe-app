import { Body, Controller, Get, Module, Patch, UseGuards } from '@nestjs/common';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, MaxLength, Max, Min } from 'class-validator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { APP_CONFIG, writeRuntimeConfig } from './app-config';

// Business rules that admins may tune from the UI. Kept deliberately small —
// only settings that need to change at runtime without a deploy live here.
class UpdateConfigDto {
  @IsOptional() @IsInt() @Min(0) @Max(365) backdateMaxDays?: number;
  @IsOptional() @IsNumber() @Min(0.25) @Max(24) maxTaskHours?: number;
  @IsOptional() @IsInt() @Min(0) @Max(1440) taskEntryWindowMinutes?: number;
  @IsOptional() @IsString() @MaxLength(500) dashboardNotice?: string;
  @IsOptional() @IsIn(['red', 'amber', 'blue', 'green', 'slate']) dashboardNoticeColor?: string;
}

@Controller('config')
@UseGuards(RolesGuard)
class ConfigController {
  // Any authenticated user may read the rules they're subject to (e.g. the
  // Tasks date-picker needs backdateMaxDays to bound how far back it allows).
  @Get()
  get() {
    return { backdateMaxDays: APP_CONFIG.backdateMaxDays, maxTaskHours: APP_CONFIG.maxTaskHours, taskEntryWindowMinutes: APP_CONFIG.taskEntryWindowMinutes, dashboardNotice: APP_CONFIG.dashboardNotice, dashboardNoticeColor: APP_CONFIG.dashboardNoticeColor };
  }

  // Admin-only: persist changes to runtime-config.json — live, no restart.
  @Patch()
  @Roles('Admin')
  update(@Body() dto: UpdateConfigDto) {
    const patch: Record<string, unknown> = {};
    if (dto.backdateMaxDays !== undefined) patch.backdateMaxDays = dto.backdateMaxDays;
    if (dto.maxTaskHours !== undefined) patch.maxTaskHours = dto.maxTaskHours;
    if (dto.taskEntryWindowMinutes !== undefined) patch.taskEntryWindowMinutes = dto.taskEntryWindowMinutes;
    if (dto.dashboardNotice !== undefined) patch.dashboardNotice = dto.dashboardNotice;
    if (dto.dashboardNoticeColor !== undefined) patch.dashboardNoticeColor = dto.dashboardNoticeColor;
    if (Object.keys(patch).length) writeRuntimeConfig(patch);
    return { backdateMaxDays: APP_CONFIG.backdateMaxDays, maxTaskHours: APP_CONFIG.maxTaskHours, taskEntryWindowMinutes: APP_CONFIG.taskEntryWindowMinutes, dashboardNotice: APP_CONFIG.dashboardNotice, dashboardNoticeColor: APP_CONFIG.dashboardNoticeColor };
  }
}

@Module({ controllers: [ConfigController] })
export class ConfigModule {}

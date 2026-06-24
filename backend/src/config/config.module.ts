import { Body, Controller, Get, Module, Patch, UseGuards } from '@nestjs/common';
import { IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { APP_CONFIG, writeRuntimeConfig } from './app-config';

// Business rules that admins may tune from the UI. Kept deliberately small —
// only settings that need to change at runtime without a deploy live here.
class UpdateConfigDto {
  @IsOptional() @IsInt() @Min(0) @Max(365) backdateMaxDays?: number;
  @IsOptional() @IsNumber() @Min(0.25) @Max(24) maxTaskHours?: number;
}

@Controller('config')
@UseGuards(RolesGuard)
class ConfigController {
  // Any authenticated user may read the rules they're subject to (e.g. the
  // Tasks date-picker needs backdateMaxDays to bound how far back it allows).
  @Get()
  get() {
    return { backdateMaxDays: APP_CONFIG.backdateMaxDays, maxTaskHours: APP_CONFIG.maxTaskHours };
  }

  // Admin-only: persist changes to runtime-config.json — live, no restart.
  @Patch()
  @Roles('Admin')
  update(@Body() dto: UpdateConfigDto) {
    const patch: Record<string, unknown> = {};
    if (dto.backdateMaxDays !== undefined) patch.backdateMaxDays = dto.backdateMaxDays;
    if (dto.maxTaskHours !== undefined) patch.maxTaskHours = dto.maxTaskHours;
    if (Object.keys(patch).length) writeRuntimeConfig(patch);
    return { backdateMaxDays: APP_CONFIG.backdateMaxDays, maxTaskHours: APP_CONFIG.maxTaskHours };
  }
}

@Module({ controllers: [ConfigController] })
export class ConfigModule {}

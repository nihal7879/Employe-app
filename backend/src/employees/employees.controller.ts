import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateEmployeeDto, UpdateEmployeeDto, UpdatePermissionsDto } from './dto/employee.dto';
import { EmployeesService } from './employees.service';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';

// Directory fields any signed-in user may see (pickers, mentions, names).
// Personal/HR fields — phone, joining date, permission flags — stay Admin-only.
const PUBLIC_EMPLOYEE_FIELDS = [
  'id', 'employee_code', 'name', 'email', 'designation', 'profile_image', 'is_active',
  'role_id', 'role_name', 'department_id', 'department_name',
] as const;

function publicEmployee(row: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const k of PUBLIC_EMPLOYEE_FIELDS) if (k in row) out[k] = row[k];
  return out;
}

@Controller('employees')
@UseGuards(RolesGuard)
export class EmployeesController {
  constructor(private readonly service: EmployeesService) {}

  @Get()
  async findAll(
    @Query('search') search?: string,
    @Query('department_id') department_id?: number,
    @Query('role_id') role_id?: number,
    @Query('include_admin') include_admin?: string,
    @CurrentUser() user?: AuthUser,
  ) {
    const rows = await this.service.findAll({ search, department_id, role_id, include_admin });
    return user?.role === 'Admin' ? rows : rows.map(publicEmployee);
  }

  @Get(':id')
  async findOne(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    const row = await this.service.findOne(id);
    return user.role === 'Admin' ? row : publicEmployee(row);
  }

  @Post()
  @Roles('Admin')
  create(@Body() dto: CreateEmployeeDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  @Roles('Admin')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateEmployeeDto) {
    return this.service.update(id, dto);
  }

  @Patch(':id/permissions')
  @Roles('Admin')
  setPermissions(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePermissionsDto) {
    return this.service.setPermissions(id, dto);
  }

  @Delete(':id')
  @Roles('Admin')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}

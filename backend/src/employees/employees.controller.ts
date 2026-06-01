import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateEmployeeDto, UpdateEmployeeDto, UpdatePermissionsDto } from './dto/employee.dto';
import { EmployeesService } from './employees.service';

@Controller('employees')
@UseGuards(RolesGuard)
export class EmployeesController {
  constructor(private readonly service: EmployeesService) {}

  @Get()
  findAll(
    @Query('search') search?: string,
    @Query('department_id') department_id?: number,
    @Query('role_id') role_id?: number,
    @Query('include_admin') include_admin?: string,
  ) {
    return this.service.findAll({ search, department_id, role_id, include_admin });
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
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

import {
  Controller, Get, Post, Body, Patch,
  Param, Delete, UseGuards, Query, Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { EmployeesService } from './employees.service';
import { JwtAuthGuard }     from '../auth/guards/jwt-auth.guard';

@ApiTags('Employees')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Post()
  @ApiOperation({ summary: 'Créer un employé + son compte utilisateur automatiquement' })
  create(@Body() dto: any, @Request() req) {
    return this.employeesService.create(
        dto,
        req.user.userId,
        req.user.name, // FIX : était req.user.nom — corrigé en req.user.name
        req.user.companyId,
    );
  }

  @Get()
  findAll(@Request() req, @Query('search') search?: string) {
    return this.employeesService.findAll(req.user.companyId, { search });
  }

  @Get('salary-total')
  @ApiOperation({ summary: 'Masse salariale totale des employés actifs' })
  getSalaryTotal(@Request() req) {
    return this.employeesService.getSalaryTotal(req.user.companyId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    return this.employeesService.findOne(id, req.user.companyId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: any, @Request() req) {
    return this.employeesService.update(id, req.user.companyId, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprime l\'employé et désactive son compte utilisateur' })
  remove(@Param('id') id: string, @Request() req) {
    return this.employeesService.remove(id, req.user.companyId);
  }
}
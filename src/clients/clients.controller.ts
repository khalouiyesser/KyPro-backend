import {
  Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query, Request, Res, HttpStatus,
  BadRequestException
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import { ClientsService } from './clients.service';
import { ExportService } from '../export/export.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Clients')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('clients')
export class ClientsController {
  constructor(
    private readonly clientsService: ClientsService,
    private readonly exportService: ExportService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Créer un client' })
  create(@Body() dto: any, @Request() req) {
    return this.clientsService.create(dto, req.user.userId, req.user.name, req.user.companyId);
  }


  @Post('payment/:clientId')
  async ajouterPayment(
      @Param('clientId') clientId: string,
      @Body() dto: { amount: number; note: string },
      @Request() req,
  ) {
    if (!dto.note?.trim()) throw new BadRequestException('La note est obligatoire');
    return this.clientsService.creerPaymentVenteService(
        { userId: req.user.userId, clientId, amount: dto.amount, note: dto.note },
        req.user.userId,
        req.user.companyId,
    );
  }

  @Get()
  @ApiOperation({ summary: 'Lister les clients' })
  findAll(
    @Request() req,
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
    @Query('isActive') isActive?: string,
  ) {
    return this.clientsService.findAll(req.user.companyId, { search, sortBy, sortOrder, isActive });
  }

  @Get(':id/stats')
  @ApiOperation({ summary: 'Statistiques client' })
  getStats(@Param('id') id: string, @Request() req) {
    return this.clientsService.getClientStats(id, req.user.companyId);
  }

  @Get(':id/export')
  @ApiOperation({ summary: 'Exporter bilan client' })
  async exportBilan(
    @Param('id') id: string,
    @Request() req,
    @Query('format') format: 'pdf' | 'xlsx' = 'pdf',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Res() res?: Response,
  ) {
    const client = await this.clientsService.findOne(id, req.user.companyId);
    const sales = await this.clientsService.findByClientForExport(id, req.user.companyId, startDate, endDate);

    if (format === 'xlsx') {
      const buffer = await this.exportService.generateClientBilanExcel(client, sales, startDate, endDate, req.user.companyId);
      res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="bilan-${client.name}.xlsx"` });
      return res.status(HttpStatus.OK).end(buffer);
    }
    const buffer = await this.exportService.generateClientBilanPdf(client, sales, startDate, endDate, req.user.companyId);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="bilan-${client.name}.pdf"` });
    return res.status(HttpStatus.OK).end(buffer);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtenir un client' })
  findOne(@Param('id') id: string, @Request() req) {
    return this.clientsService.findOne(id, req.user.companyId);
  }



  @Patch(':id')
  @ApiOperation({ summary: 'Modifier un client' })
  update(@Param('id') id: string, @Body() dto: any, @Request() req) {
    return this.clientsService.update(id, req.user.companyId, dto, req.user.userId, req.user.name);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un client' })
  remove(@Param('id') id: string, @Request() req) {
    return this.clientsService.remove(id, req.user.companyId);
  }



}

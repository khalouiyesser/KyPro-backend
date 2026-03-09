import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query, Request, Res, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import { VentesService } from './ventes.service';
import { ExportService } from '../export/export.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Ventes')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('ventes')
export class VenteController {
  constructor(
    private readonly ventesService: VentesService,
    private readonly exportService: ExportService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Créer une vente' })
  create(@Body() dto: any, @Request() req) {
    return this.ventesService.create(dto, req.user.userId, req.user.name, req.user.companyId);
  }

  @Get()
  @ApiOperation({ summary: 'Lister les ventes' })
  findAll(
    @Request() req,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
  ) {
    return this.ventesService.findAll(req.user.companyId, { search, status, startDate, endDate, sortBy, sortOrder });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtenir une vente' })
  findOne(@Param('id') id: string, @Request() req) {
    return this.ventesService.findOne(id, req.user.companyId);
  }

  @Post(':id/payments')
  @ApiOperation({ summary: 'Ajouter un paiement' })
  addPayment(@Param('id') id: string, @Body() dto: any, @Request() req) {
    return this.ventesService.addPayment(id, req.user.companyId, dto, req.user.userId, req.user.name);
  }

  @Get(':id/export/pdf')
  @ApiOperation({ summary: 'Exporter la facture en PDF' })
  async exportPdf(@Param('id') id: string, @Request() req, @Res() res: Response) {
    const sale = await this.ventesService.findOne(id, req.user.companyId);
    const buffer = await this.exportService.generateSaleInvoicePdf(sale, req.user.companyId);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="facture-${id}.pdf"` });
    return res.status(HttpStatus.OK).end(buffer);
  }

  @Get(':id/export/xlsx')
  @ApiOperation({ summary: 'Exporter la facture en Excel' })
  async exportExcel(@Param('id') id: string, @Request() req, @Res() res: Response) {
    const sale = await this.ventesService.findOne(id, req.user.companyId);
    const buffer = await this.exportService.generateSaleInvoiceExcel(sale, req.user.companyId);
    res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="facture-${id}.xlsx"` });
    return res.status(HttpStatus.OK).end(buffer);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer une vente' })
  remove(@Param('id') id: string, @Request() req) {
    return this.ventesService.remove(id, req.user.companyId);
  }
}

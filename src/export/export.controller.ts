import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ExportService } from './export.service';

@ApiTags('Reports')
@ApiBearerAuth('JWT')
@Controller('export')
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Get('clients/:id/report')
  @ApiOperation({ summary: 'Exporter un rapport client', description: 'Génère un rapport complet d\'un client' })
  exportClientReport(@Param('id') id: string) {
    return { message: 'Export client report', clientId: id };
  }

  @Get('sales/report')
  @ApiOperation({ summary: 'Exporter le rapport des ventes', description: 'Génère un rapport de ventes périodique' })
  exportSalesReport() {
    return { message: 'Export sales report' };
  }

  @Get('purchases/report')
  @ApiOperation({ summary: 'Exporter le rapport des achats', description: 'Génère un rapport d\'achats périodique' })
  exportPurchasesReport() {
    return { message: 'Export purchases report' };
  }

  @Get('accounting/report')
  @ApiOperation({ summary: 'Exporter le rapport comptable', description: 'Génère un rapport comptable complet' })
  exportAccountingReport() {
    return { message: 'Export accounting report' };
  }
}

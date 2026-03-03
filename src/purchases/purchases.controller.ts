import { Controller, Get, Post, Body, Param, Delete, UseGuards, Query, Request, Res, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import { PurchasesService } from './purchases.service';
import { ExportService } from '../export/export.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Purchases')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('purchases')
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService, private readonly exportService: ExportService) {}

  @Post() create(@Body() dto: any, @Request() req) {
    console.log(222222222222222222222222)
    return this.purchasesService.create(dto, req.user.userId, req.user.name, req.user.companyId);
  }
  @Get() findAll(@Request() req, @Query('search') search?: string, @Query('status') status?: string, @Query('sortBy') sortBy?: string, @Query('sortOrder') sortOrder?: 'asc'|'desc') { return this.purchasesService.findAll(req.user.companyId, { search, status, sortBy, sortOrder }); }
  @Get(':id') findOne(@Param('id') id: string, @Request() req) { return this.purchasesService.findOne(id, req.user.companyId); }

  @Post(':id/payment')
  @ApiOperation({ summary: 'Ajouter un paiement' })
  addPayment(@Param('id') id: string, @Body() body: { amount: number }, @Request() req) {
    return this.purchasesService.addPayment(id, req.user.companyId, body.amount, req.user.userId);
  }

  @Get(':id/export/pdf')
  async exportPdf(@Param('id') id: string, @Request() req, @Res() res: Response) {
    const purchase = await this.purchasesService.findOne(id, req.user.companyId);
    const buffer = await this.exportService.generatePurchasePdf(purchase, req.user.companyId);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="achat-${id}.pdf"` });
    return res.status(HttpStatus.OK).end(buffer);
  }

  @Delete(':id') remove(@Param('id') id: string, @Request() req) { return this.purchasesService.remove(id, req.user.companyId); }
}

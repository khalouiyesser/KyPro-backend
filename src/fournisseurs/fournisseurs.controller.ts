import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Request,
  Res,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FournisseursService } from './fournisseurs.service';
import { ExportService } from '../export/export.service';

@ApiTags('Fournisseurs')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('fournisseurs')
export class FournisseursController {
  constructor(
      private readonly fournisseursService: FournisseursService,
      private readonly exportService: ExportService,
  ) {}

  @Post()
  create(@Body() dto: any, @Request() req) {
    return this.fournisseursService.create(
        dto,
        req.user.userId,
        req.user.name,
        req.user.companyId,
    );
  }

  @Get()
  findAll(
      @Request() req,
      @Query('search')    search?:    string,
      @Query('sortBy')    sortBy?:    string,
      @Query('sortOrder') sortOrder?: 'asc' | 'desc',
  ) {
    return this.fournisseursService.findAll(req.user.companyId, {
      search, sortBy, sortOrder,
    });
  }

  // ⚠️ Routes spécifiques AVANT :id ─────────────────────────────────────────

  /**
   * POST /fournisseurs/:id/payment
   * Paiement direct sur un fournisseur, sans achat lié
   */
  @Post(':id/payment')
  @ApiOperation({ summary: 'Paiement direct sur un fournisseur' })
  addDirectPayment(
      @Param('id') id: string,
      @Body() body: { amount: number; note: string },
      @Request() req,
  ) {
    if (!body.note?.trim())
      throw new BadRequestException('La note est obligatoire');
    if (!body.amount || body.amount <= 0)
      throw new BadRequestException('Montant invalide');

    return this.fournisseursService.addDirectPayment(
        id,
        req.user.companyId,
        body.amount,
        body.note,
        req.user.userId,
    );
  }

  /**
   * GET /fournisseurs/userId/:userId/fournisseurId/:fournisseurId/purchases
   * Achats + paiements d'un fournisseur (utilisé par SupplierDetailPage)
   */
  @Get('userId/:userId/fournisseurId/:fournisseurId/purchases')
  @ApiOperation({ summary: "Achats + paiements d'un fournisseur" })
  getPurchases(
      @Param('fournisseurId') fournisseurId: string,
      @Request() req,
      @Query('startDate') startDate?: string,
      @Query('endDate')   endDate?:   string,
      @Query('status')    status?:    string,
  ) {
    return this.fournisseursService.getPurchases(
        fournisseurId,
        req.user.companyId,
        { startDate, endDate, status },
    );
  }

  /**
   * GET /fournisseurs/:id/export
   * Export bilan fournisseur en PDF ou Excel
   */
  @Get(':id/export')
  @ApiOperation({ summary: 'Export bilan fournisseur PDF/Excel' })
  async exportBilan(
      @Param('id') id: string,
      @Res() res,
      @Request() req,
      @Query('format')    format?:    string,
      @Query('startDate') startDate?: string,
      @Query('endDate')   endDate?:   string,
  ) {
    const fmt = format || 'pdf';

    // Achats filtrés par période (pour le tableau)
    const data = await this.fournisseursService.getPurchases(
        id,
        req.user.companyId,
        { startDate, endDate },
    );

    // Stats globales sans filtre de dates (pour les totaux réels)
    const globalData = await this.fournisseursService.getPurchases(
        id,
        req.user.companyId,
        {},
    );

    if (fmt === 'xlsx') {
      const buffer = await this.exportService.generateFournisseurBilanExcel(
          data.fournisseur,
          data.purchases,
          globalData.stats,
          startDate,
          endDate,
          req.user.companyId,
      );
      res.set({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="bilan-fournisseur-${data.fournisseur.name}.xlsx"`,
      });
      return res.send(buffer);
    }

    const buffer = await this.exportService.generateFournisseurBilanPdf(
        data.fournisseur,
        data.purchases,
        globalData.stats,
        startDate,
        endDate,
        req.user.companyId,
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="bilan-fournisseur-${data.fournisseur.name}.pdf"`,
    });
    return res.send(buffer);
  }

  // Routes génériques :id EN DERNIER ────────────────────────────────────────

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    return this.fournisseursService.findOne(id, req.user.companyId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: any, @Request() req) {
    return this.fournisseursService.update(
        id,
        req.user.companyId,
        dto,
        req.user.userId,
        req.user.name,
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req) {
    return this.fournisseursService.remove(id, req.user.companyId);
  }

  @Post(':id/products')
  addProduct(
      @Param('id') id: string,
      @Body() body: { productId: string },
      @Request() req,
  ) {
    return this.fournisseursService.addProduct(id, body.productId, req.user.companyId);
  }

  @Delete(':id/products/:productId')
  removeProduct(
      @Param('id') id: string,
      @Param('productId') productId: string,
      @Request() req,
  ) {
    return this.fournisseursService.removeProduct(id, productId, req.user.companyId);
  }
}
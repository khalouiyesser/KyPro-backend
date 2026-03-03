import {
  Controller, Get, Post, Body, Patch, Param, Delete,
  UseGuards, Query, Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { FournisseursService } from './fournisseurs.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Fournisseurs')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('fournisseurs')
export class FournisseursController {
  constructor(private readonly fournisseursService: FournisseursService) {}

  // ── CRUD de base ─────────────────────────────────────────────────────────

  @Post()
  @ApiOperation({ summary: 'Créer un fournisseur' })
  create(@Body() dto: any, @Request() req) {
    return this.fournisseursService.create(
        dto,
        req.user.userId,
        req.user.name,
        req.user.companyId,
    );
  }

  @Get()
  @ApiOperation({ summary: 'Lister les fournisseurs de la company' })
  findAll(
      @Request() req,
      @Query('search') search?: string,
      @Query('sortBy') sortBy?: string,
      @Query('sortOrder') sortOrder?: 'asc' | 'desc',
  ) {
    return this.fournisseursService.findAll(req.user.companyId, {
      search, sortBy, sortOrder,
    });
  }

  // ⚠️  Cette route DOIT être avant :id pour éviter que NestJS
  //     la confonde avec GET /fournisseurs/:id
  @Get('userId/:userId/fournisseurId/:fournisseurId/purchases')
  @ApiOperation({ summary: 'Achats d\'un fournisseur filtrés par company (via JWT)' })
  getPurchases(
      @Param('fournisseurId') fournisseurId: string,
      @Request() req,
      @Query('startDate') startDate?: string,
      @Query('endDate')   endDate?: string,
      @Query('status')    status?: string,
  ) {
    // companyId vient du JWT — userId dans l'URL n'est pas utilisé
    // (on garde ce pattern d'URL pour rétro-compatibilité avec le frontend)
    return this.fournisseursService.getPurchases(
        fournisseurId,
        req.user.companyId,
        { startDate, endDate, status },
    );
  }

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

  // ── Produits liés ────────────────────────────────────────────────────────

  @Post(':id/products')
  @ApiOperation({ summary: 'Associer un produit existant à un fournisseur' })
  addProduct(
      @Param('id') id: string,
      @Body() body: { productId: string },
      @Request() req,
  ) {
    return this.fournisseursService.addProduct(
        id,
        body.productId,
        req.user.companyId,
    );
  }

  @Delete(':id/products/:productId')
  @ApiOperation({ summary: "Retirer un produit d'un fournisseur" })
  removeProduct(
      @Param('id') id: string,
      @Param('productId') productId: string,
      @Request() req,
  ) {
    return this.fournisseursService.removeProduct(
        id,
        productId,
        req.user.companyId,
    );
  }
}
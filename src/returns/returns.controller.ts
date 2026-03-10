import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { ReturnsService } from './returns.service';
import { ReturnStatus } from './return.schema';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiCreate, ApiGetAll, ApiGetOne, ApiAction, ApiDelete } from '../common/swagger/swagger-decorators';

@ApiTags('Returns')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('returns')
export class ReturnsController {
  constructor(private readonly returnsService: ReturnsService) {}

  @Post()
  @ApiCreate('Créer un retour de produit')
  create(@Body() dto: any, @Request() req) {
    return this.returnsService.create(dto, req.user.userId, req.user.name, req.user.companyId);
  }

  @Get()
  @ApiGetAll('Récupérer la liste des retours')
  @ApiQuery({ name: 'status', required: false, description: 'Filtrer par statut (PENDING, APPROVED, REFUNDED, REJECTED)' })
  @ApiQuery({ name: 'search', required: false, description: 'Rechercher par référence' })
  findAll(@Request() req, @Query('status') status?: string, @Query('search') search?: string) {
    return this.returnsService.findAll(req.user.companyId, { status, search });
  }

  @Get(':id')
  @ApiGetOne('Récupérer les détails d\'un retour')
  @ApiParam({ name: 'id', description: 'ID du retour' })
  findOne(@Param('id') id: string, @Request() req) {
    return this.returnsService.findOne(id, req.user.companyId);
  }

  @Patch(':id/approve')
  @ApiAction('Approuver un retour', 'Approuver un retour de produit')
  @ApiParam({ name: 'id' })
  approve(@Param('id') id: string, @Request() req) {
    return this.returnsService.updateStatus(id, req.user.companyId, ReturnStatus.APPROVED);
  }

  @Patch(':id/refund')
  @ApiAction('Effectuer le remboursement', 'Marquer un retour comme remboursé')
  @ApiParam({ name: 'id' })
  refund(@Param('id') id: string, @Request() req) {
    return this.returnsService.updateStatus(id, req.user.companyId, ReturnStatus.REFUNDED);
  }

  @Patch(':id/reject')
  @ApiAction('Rejeter un retour', 'Refuser un retour de produit')
  @ApiParam({ name: 'id' })
  reject(@Param('id') id: string, @Request() req) {
    return this.returnsService.updateStatus(id, req.user.companyId, ReturnStatus.REJECTED);
  }

  @Delete(':id')
  @ApiDelete('Supprimer un retour')
  @ApiParam({ name: 'id' })
  remove(@Param('id') id: string, @Request() req) {
    return this.returnsService.remove(id, req.user.companyId);
  }
}

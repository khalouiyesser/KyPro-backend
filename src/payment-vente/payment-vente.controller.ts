import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { PaymentVenteService } from './payment-vente.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiGetAll, ApiUpdate, ApiDelete } from '../common/swagger/swagger-decorators';

@ApiTags('Payments Vente')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('payment-vente')
export class PaymentVenteController {
  constructor(private readonly paymentVenteService: PaymentVenteService) {}

  @Get()
  @ApiGetAll('Récupérer la liste des paiements de ventes')
  findAll(@Request() req) {
    return this.paymentVenteService.findAll(req.user.companyId);
  }

  @Patch(':id')
  @ApiUpdate('Modifier un paiement de vente')
  @ApiParam({ name: 'id', description: 'ID du paiement' })
  update(@Param('id') id: string, @Body() dto: { amount?: number; note?: string }, @Request() req) {
    return this.paymentVenteService.update(id, req.user.companyId, dto);
  }

  @Delete(':id')
  @ApiDelete('Supprimer un paiement de vente')
  @ApiParam({ name: 'id' })
  remove(@Param('id') id: string, @Request() req) {
    return this.paymentVenteService.remove(id, req.user.companyId);
  }
}
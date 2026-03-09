import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PaymentVenteService } from './payment-vente.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Payments Vente')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('payment-vente')
export class PaymentVenteController {
  constructor(private readonly paymentVenteService: PaymentVenteService) {}

  @Get()
  findAll(@Request() req) {
    return this.paymentVenteService.findAll(req.user.companyId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: { amount?: number; note?: string }, @Request() req) {
    return this.paymentVenteService.update(id, req.user.companyId, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req) {
    return this.paymentVenteService.remove(id, req.user.companyId);
  }
}
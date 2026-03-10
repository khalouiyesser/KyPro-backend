import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PaymentAchatService } from './payment-achat.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Payments Achat')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('payment-achat')
export class PaymentAchatController {
  constructor(private readonly paymentAchatService: PaymentAchatService) {}

  @Get()
  @ApiOperation({ summary: 'Lister tous les paiements achat de la company' })
  findAll(@Request() req) {
    return this.paymentAchatService.findAll(req.user.companyId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Modifier un paiement achat' })
  update(
      @Param('id') id: string,
      @Body() dto: { amount?: number; note?: string },
      @Request() req,
  ) {
    return this.paymentAchatService.update(id, req.user.companyId, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un paiement achat' })
  remove(@Param('id') id: string, @Request() req) {
    return this.paymentAchatService.remove(id, req.user.companyId);
  }
}
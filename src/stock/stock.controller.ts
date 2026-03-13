import { Controller, Get, Post, Body, Query, UseGuards, Request, Param, Patch } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { StockService } from './stock.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Stock')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('stock')
export class StockController {
  constructor(private readonly stockService: StockService) {}

  @Get()
  @ApiOperation({ summary: 'Mouvements de stock' })
  @ApiQuery({ name: 'type',       required: false })
  @ApiQuery({ name: 'productId',  required: false })
  @ApiQuery({ name: 'startDate',  required: false })
  @ApiQuery({ name: 'endDate',    required: false })
  @ApiQuery({ name: 'limit',      required: false })
  findAll(
      @Request() req,
      @Query('type')       type?:      string,
      @Query('productId')  productId?: string,
      @Query('startDate')  startDate?: string,
      @Query('endDate')    endDate?:   string,
      @Query('limit')      limit?:     string,
  ) {
    return this.stockService.findAll(req.user.companyId, {
      type,
      productId,
      startDate,
      endDate,
      limit: limit ? parseInt(limit, 10) : 200,
    });
  }

  @Post('adjust')
  @ApiOperation({ summary: 'Ajustement manuel du stock' })
  adjust(@Request() req, @Body() dto: { productId: string; quantity: number; notes?: string }) {
    return this.stockService.manualAdjust({
      ...dto,
      userId:    req.user._id,
      companyId: req.user.companyId,
    });
  }

  @Patch(':productId/threshold')
  @ApiOperation({ summary: "Mise à jour du seuil d'alerte" })
  updateThreshold(
      @Request() req,
      @Param('productId') productId: string,
      @Body('threshold')  threshold: number,
  ) {
    return this.stockService.updateThreshold(productId, threshold, req.user.companyId);
  }
}
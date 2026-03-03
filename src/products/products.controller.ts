import {
  Controller, Get, Post, Body, Patch, Param, Delete,
  UseGuards, Query, Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Products')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @ApiOperation({ summary: 'Créer un produit' })
  create(@Body() dto: any, @Request() req) {
    return this.productsService.create(
        dto,
        req.user.userId,
        req.user.name,
        req.user.companyId,
    );
  }

  @Get()
  @ApiOperation({ summary: 'Lister les produits' })
  findAll(
      @Request() req,
      @Query('search') search?: string,
      @Query('lowStock') lowStock?: string,
      @Query('sortBy') sortBy?: string,
      @Query('sortOrder') sortOrder?: 'asc' | 'desc',
  ) {
    return this.productsService.findAll(req.user.companyId, {
      search, lowStock, sortBy, sortOrder,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    return this.productsService.findOne(id, req.user.companyId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: any, @Request() req) {
    return this.productsService.update(
        id,
        req.user.companyId,
        dto,
        req.user.userId,
        req.user.name,
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req) {
    return this.productsService.remove(id, req.user.companyId);
  }
}
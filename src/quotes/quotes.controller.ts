// import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query, Request, Res, HttpStatus } from '@nestjs/common';
// import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
// import { Response } from 'express';
// import { QuotesService } from './quotes.service';
// import { ExportService } from '../export/export.service';
// import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
//
// @ApiTags('Quotes')
// @ApiBearerAuth('JWT')
// @UseGuards(JwtAuthGuard)
// @Controller('quotes')
// export class QuotesController {
//   constructor(private readonly quotesService: QuotesService,
//               private readonly exportService: ExportService) {}
//
//   @Post()
//   create(@Body() dto: any, @Request() req) { return this.quotesService.create(dto, req.user.userId, req.user.name, req.user.companyId); }
//
//   @Get()
//   findAll(@Request() req, @Query('search') search?: string, @Query('status') status?: string) {
//     return this.quotesService.findAll(req.user.companyId, { search, status });
//   }
//
//   @Get(':id')
//   findOne(@Param('id') id: string, @Request() req) { return this.quotesService.findOne(id, req.user.companyId); }
//
//   @Patch(':id')
//   update(@Param('id') id: string, @Body() dto: any, @Request() req) { return this.quotesService.update(id, req.user.companyId, dto); }
//
//   @Post(':id/convert-to-sale')
//   @ApiOperation({ summary: 'Convertir un devis en vente' })
//   convertToSale(@Param('id') id: string, @Request() req) { return this.quotesService.convertToSale(id, req.user.companyId); }
//
//   @Get(':id/export/pdf')
//   async exportPdf(@Param('id') id: string, @Request() req, @Res() res: Response) {
//     const quote = await this.quotesService.findOne(id, req.user.companyId);
//     const buffer = await this.exportService.generateQuotePdf(quote, req.user.companyId);
//     res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="devis-${id}.pdf"` });
//     return res.status(HttpStatus.OK).end(buffer);
//   }
//
//   @Delete(':id')
//   remove(@Param('id') id: string, @Request() req) { return this.quotesService.remove(id, req.user.companyId); }
// }


import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
  Request,
  Res,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { Response } from 'express';
import { QuotesService }  from './quotes.service';
import { ExportService }  from '../export/export.service';
import { JwtAuthGuard }   from '../auth/guards/jwt-auth.guard';

@ApiTags('Quotes')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('quotes')
export class QuotesController {
  constructor(
      private readonly quotesService: QuotesService,
      private readonly exportService: ExportService,
  ) {}

  // ── POST /quotes ───────────────────────────────────────────────────────────
  @Post()
  @ApiOperation({ summary: 'Créer un nouveau devis' })
  create(@Body() dto: any, @Request() req) {
    return this.quotesService.create(
        dto,
        req.user.userId,
        req.user.name,
        req.user.companyId,
    );
  }

  // ── GET /quotes ────────────────────────────────────────────────────────────
  @Get()
  @ApiOperation({ summary: 'Lister les devis de la société' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false, enum: ['draft', 'sent', 'accepted', 'rejected', 'expired'] })
  findAll(
      @Request() req,
      @Query('search') search?: string,
      @Query('status') status?: string,
  ) {
    return this.quotesService.findAll(req.user.companyId, { search, status });
  }

  // ── GET /quotes/:id ────────────────────────────────────────────────────────
  @Get(':id')
  @ApiOperation({ summary: 'Récupérer un devis par son ID' })
  findOne(@Param('id') id: string, @Request() req) {
    return this.quotesService.findOne(id, req.user.companyId);
  }

  // ── PATCH /quotes/:id ─────────────────────────────────────────────────────
  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour un devis' })
  update(@Param('id') id: string, @Body() dto: any, @Request() req) {
    return this.quotesService.update(id, req.user.companyId, dto);
  }

  // ── POST /quotes/:id/convert-to-sale ──────────────────────────────────────
  @Post(':id/convert-to-sale')
  @ApiOperation({ summary: 'Convertir un devis accepté en vente (crée la vente en base)' })
  convertToSale(@Param('id') id: string, @Request() req) {
    // FIX : on passe userId + userName pour que la vente ait le bon créateur
    return this.quotesService.convertToSale(
        id,
        req.user.companyId,
        req.user.userId,
        req.user.name,
    );
  }

  // ── GET /quotes/:id/export/pdf ─────────────────────────────────────────────
  @Get(':id/export/pdf')
  @ApiOperation({ summary: 'Télécharger le devis en PDF' })
  async exportPdf(@Param('id') id: string, @Request() req, @Res() res: Response) {
    const quote  = await this.quotesService.findOne(id, req.user.companyId);
    const buffer = await this.exportService.generateQuotePdf(quote, req.user.companyId);

    res.set({
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="devis-${quote.quoteNumber ?? id}.pdf"`,
      'Content-Length':      buffer.length,
    });
    return res.status(HttpStatus.OK).end(buffer);
  }

  // ── DELETE /quotes/:id ────────────────────────────────────────────────────
  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un devis' })
  remove(@Param('id') id: string, @Request() req) {
    return this.quotesService.remove(id, req.user.companyId);
  }
}

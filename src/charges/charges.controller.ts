import {
  Controller, Get, Post, Body, Patch, Param, Delete,
  UseGuards, Query, Request, UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { ChargesService } from './charges.service';
import { OcrService } from '../ocr/ocr.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Charges')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('charges')
export class ChargesController {
  constructor(
      private readonly chargesService: ChargesService,
      private readonly ocrService: OcrService,
  ) {}

  @Post()
  create(@Body() dto: any, @Request() req) {
    return this.chargesService.create(dto, req.user.userId, req.user.name, req.user.companyId);
  }

  @Get()
  findAll(
      @Request() req,
      @Query('search') search?: string,
      @Query('type') type?: string,
      @Query('startDate') startDate?: string,
      @Query('endDate') endDate?: string,
      @Query('sortBy') sortBy?: string,
      @Query('sortOrder') sortOrder?: 'asc' | 'desc',
  ) {
    return this.chargesService.findAll(req.user.companyId, { search, type, startDate, endDate, sortBy, sortOrder });
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    return this.chargesService.findOne(id, req.user.companyId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: any, @Request() req) {
    return this.chargesService.update(id, req.user.companyId, dto, req.user.userId, req.user.name);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req) {
    return this.chargesService.remove(id, req.user.companyId);
  }

  // ── OCR: analyse depuis URL ──────────────────────────────────────────────
  @Post('ocr/url')
  @ApiOperation({ summary: 'Analyser une facture depuis une URL image' })
  async analyzeFromUrl(@Body() body: { imageUrl: string }, @Request() req) {
    return this.ocrService.analyzeFromUrl(body.imageUrl, req.user.companyId);
  }

  // ── OCR: analyse depuis fichier uploadé (base64) ─────────────────────────
  @Post('ocr/upload')
  @ApiOperation({ summary: 'Analyser une facture uploadée (base64)' })
  async analyzeFromUpload(
      @Body() body: { base64: string; mimeType: string },
      @Request() req,
  ) {
    return this.ocrService.analyzeFromBase64(body.base64, body.mimeType, req.user.companyId);
  }

  // ── OCR legacy: analyse une charge existante ─────────────────────────────
  @Post(':id/analyze')
  @ApiOperation({ summary: 'Analyser la facture d\'une charge existante (imageUrl)' })
  async analyzeCharge(@Param('id') id: string, @Request() req) {
    const charge = await this.chargesService.findOne(id, req.user.companyId);
    if (!charge.imageUrl) {
      return { error: 'Aucune image associée à cette charge' };
    }
    return this.ocrService.analyzeFromUrl(charge.imageUrl, req.user.companyId);
  }
}
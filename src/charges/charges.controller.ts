import {
  Controller, Get, Post, Body, Patch, Param, Delete,
  UseGuards, Query, Request, HttpCode, HttpStatus,
} from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation, ApiResponse,
  ApiParam, ApiQuery, ApiBody,
} from '@nestjs/swagger';
import { ChargesService } from './charges.service';
import { OcrService } from '../ocr/ocr.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateChargeDto, OcrFromBase64Dto, OcrFromUrlDto } from './dto/OcrFromUrlDto';

@ApiTags('Charges')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('charges')
export class ChargesController {
  constructor(
      private readonly chargesService: ChargesService,
      private readonly ocrService: OcrService,
  ) {}

  // ══════════════════════════════════════════════════════════════════════════
  //  CRUD
  // ══════════════════════════════════════════════════════════════════════════

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Créer une charge',
    description: 'Crée une nouvelle charge pour la société de l\'utilisateur connecté. Les lignes de facturation (`items`) sont persistées en base.',
  })
  @ApiBody({ type: CreateChargeDto })
  @ApiResponse({ status: 201, description: 'Charge créée avec succès' })
  @ApiResponse({ status: 400, description: 'Données invalides' })
  @ApiResponse({ status: 401, description: 'Non authentifié' })
  create(@Body() dto: CreateChargeDto, @Request() req) {
    return this.chargesService.create(
        dto,
        req.user.userId,
        req.user.name,
        req.user.companyId,
    );
  }

  @Get()
  @ApiOperation({
    summary: 'Lister les charges de la société',
    description: 'Retourne toutes les charges de la société triées par date décroissante. Supporte la recherche, le filtrage par type et par période.',
  })
  @ApiQuery({ name: 'search',    required: false, description: 'Recherche dans description et référence' })
  @ApiQuery({ name: 'type',      required: false, description: 'Filtrer par type', enum: ['rent','salary','utilities','equipment','marketing','tax','insurance','accounting','fuel','other'] })
  @ApiQuery({ name: 'startDate', required: false, description: 'Date de début (YYYY-MM-DD)' })
  @ApiQuery({ name: 'endDate',   required: false, description: 'Date de fin (YYYY-MM-DD)' })
  @ApiQuery({ name: 'sortBy',    required: false, description: 'Champ de tri (ex: date, amount)' })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'], description: 'Ordre de tri' })
  @ApiResponse({ status: 200, description: 'Liste des charges' })
  @ApiResponse({ status: 401, description: 'Non authentifié' })
  findAll(
      @Request() req,
      @Query('search')    search?:    string,
      @Query('type')      type?:      string,
      @Query('startDate') startDate?: string,
      @Query('endDate')   endDate?:   string,
      @Query('sortBy')    sortBy?:    string,
      @Query('sortOrder') sortOrder?: 'asc' | 'desc',
  ) {
    return this.chargesService.findAll(req.user.companyId, {
      search, type, startDate, endDate, sortBy, sortOrder,
    });
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Récupérer une charge par ID',
    description: 'Retourne les détails complets d\'une charge, incluant les lignes de facturation.',
  })
  @ApiParam({ name: 'id', description: 'ID MongoDB de la charge' })
  @ApiResponse({ status: 200, description: 'Charge trouvée' })
  @ApiResponse({ status: 404, description: 'Charge introuvable' })
  @ApiResponse({ status: 401, description: 'Non authentifié' })
  findOne(@Param('id') id: string, @Request() req) {
    return this.chargesService.findOne(id, req.user.companyId);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Mettre à jour une charge',
    description: 'Met à jour les champs d\'une charge existante. Les `items` sont remplacés intégralement.',
  })
  @ApiParam({ name: 'id', description: 'ID MongoDB de la charge' })
  @ApiBody({ type: CreateChargeDto })
  @ApiResponse({ status: 200, description: 'Charge mise à jour' })
  @ApiResponse({ status: 400, description: 'Données invalides' })
  @ApiResponse({ status: 404, description: 'Charge introuvable' })
  @ApiResponse({ status: 401, description: 'Non authentifié' })
  update(@Param('id') id: string, @Body() dto: CreateChargeDto, @Request() req) {
    return this.chargesService.update(
        id,
        req.user.companyId,
        dto,
        req.user.userId,
        req.user.name,
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer une charge' })
  @ApiParam({ name: 'id', description: 'ID MongoDB de la charge' })
  @ApiResponse({ status: 204, description: 'Charge supprimée' })
  @ApiResponse({ status: 404, description: 'Charge introuvable' })
  @ApiResponse({ status: 401, description: 'Non authentifié' })
  remove(@Param('id') id: string, @Request() req) {
    return this.chargesService.remove(id, req.user.companyId);
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  OCR
  // ══════════════════════════════════════════════════════════════════════════

  @Post('ocr/url')
  @ApiOperation({
    summary: 'Analyser une facture depuis une URL',
    description: `Lance l'analyse OCR sur une image ou un PDF accessible via URL.

**Pipeline :**
1. OCR Space extrait le texte brut
2. Extraction regex des champs (montants, date, TVA, items…)
3. Gemini raffine les résultats
4. Fusion intelligente (score) des deux résultats

**Retourne :** \`{ rawText, winner, suggestion }\` où \`suggestion\` contient tous les champs extraits dont \`items\`.`,
  })
  @ApiBody({ type: OcrFromUrlDto })
  @ApiResponse({
    status: 200,
    description: 'Données extraites',
    schema: {
      example: {
        rawText: '...',
        winner: 'ocr',
        suggestion: {
          description: 'Facture E-INFO N°68',
          amount: 279,
          amountHT: 273.682,
          date: '2024-03-16',
          source: '68',
          type: 'equipment',
          tva: 7,
          currency: 'TND',
          isDevis: false,
          items: [
            { label: 'SOURIS RAMITECH USB TB220', total: 8 },
            { label: 'SOURIS SANS FILS W55 NOIR', total: 15 },
          ],
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'URL invalide, type non supporté, ou quota OCR épuisé' })
  @ApiResponse({ status: 401, description: 'Non authentifié' })
  analyzeFromUrl(@Body() dto: OcrFromUrlDto, @Request() req) {
    return this.ocrService.analyzeFromUrl(dto.imageUrl, req.user.companyId);
  }

  @Post('ocr/upload')
  @ApiOperation({
    summary: 'Analyser une facture uploadée en base64',
    description: `Lance l'analyse OCR sur un fichier encodé en base64 (image JPG/PNG/WEBP/GIF ou PDF).

**Pipeline :**
1. Gemini Vision lit l'image/PDF directement (prioritaire, plus précis)
2. Si Gemini échoue → OCR Space (fallback)
3. Extraction regex + Gemini post-processing en parallèle
4. Fusion intelligente

**Retourne :** \`{ rawText, winner, suggestion }\``,
  })
  @ApiBody({ type: OcrFromBase64Dto })
  @ApiResponse({
    status: 200,
    description: 'Données extraites',
    schema: {
      example: {
        rawText: '',
        winner: 'gemini-vision',
        suggestion: {
          description: 'E-INFO Expert Informatique Djerba',
          amount: 279,
          amountHT: 273.682,
          date: '2024-03-16',
          source: '68',
          type: 'equipment',
          tva: 7,
          currency: 'TND',
          isDevis: false,
          items: [
            { label: 'SOURIS RAMITECH USB TB220', total: 8 },
            { label: 'SOURIS SANS FILS W55 NOIR', total: 15 },
            { label: 'CHARGEUR 2 PORTS MICRO USB 2.1A BLANC', total: 200 },
            { label: 'CARTES MEMOIRES 32G', total: 21 },
            { label: 'BOITIER 2.5 SATA M2', total: 22 },
            { label: 'Impression Grand Format A0', total: 12 },
          ],
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Base64 invalide, type MIME non supporté, ou quota OCR épuisé' })
  @ApiResponse({ status: 401, description: 'Non authentifié' })
  analyzeFromUpload(@Body() dto: OcrFromBase64Dto, @Request() req) {
    return this.ocrService.analyzeFromBase64(dto.base64, dto.mimeType, req.user.companyId);
  }

  @Post(':id/analyze')
  @ApiOperation({
    summary: 'Analyser la facture d\'une charge existante',
    description: 'Relance l\'analyse OCR sur l\'`imageUrl` d\'une charge déjà enregistrée. Utile pour re-traiter une facture ou améliorer l\'extraction.',
  })
  @ApiParam({ name: 'id', description: 'ID MongoDB de la charge' })
  @ApiResponse({ status: 200, description: 'Données extraites de la facture' })
  @ApiResponse({ status: 400, description: 'Aucune image associée à cette charge' })
  @ApiResponse({ status: 404, description: 'Charge introuvable' })
  @ApiResponse({ status: 401, description: 'Non authentifié' })
  async analyzeCharge(@Param('id') id: string, @Request() req) {
    const charge = await this.chargesService.findOne(id, req.user.companyId);
    if (!charge.imageUrl) {
      return { error: 'Aucune image associée à cette charge' };
    }
    return this.ocrService.analyzeFromUrl(charge.imageUrl, req.user.companyId);
  }
}
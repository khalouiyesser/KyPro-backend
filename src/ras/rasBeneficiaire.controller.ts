import {
    Controller, Get, Post, Patch, Delete,
    Param, Body, Query, Request,
    UseGuards, ValidationPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateRasBeneficiaireDto, UpdateRasBeneficiaireDto } from './ras.dto';
import {RasBeneficiaireService} from "./rasBeneficiaire.service";

@ApiTags('RAS Bénéficiaire')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('ras-beneficiaire')
export class RasBeneficiaireController {
    constructor(private readonly service: RasBeneficiaireService) {}

    /* ── POST /ras-beneficiaire ──────────────────────────────────── */
    @Post()
    @ApiOperation({ summary: 'Enregistrer un certificat RAS reçu d\'un client (crédit d\'impôt compte 4135)' })
    create(
        @Body(ValidationPipe) dto: CreateRasBeneficiaireDto,
        @Request() req,
    ) {
        return this.service.create(dto, req.user.userId, req.user.companyId);
    }

    /* ── GET /ras-beneficiaire ───────────────────────────────────── */
    @Get()
    @ApiOperation({ summary: 'Lister les certificats RAS reçus' })
    @ApiQuery({ name: 'exercice', required: false, type: Number })
    @ApiQuery({ name: 'mois',     required: false, type: Number })
    @ApiQuery({ name: 'utilise',  required: false, type: Boolean })
    findAll(
        @Request() req,
        @Query('exercice') exercice?: string,
        @Query('mois')     mois?:     string,
        @Query('utilise')  utilise?:  string,
    ) {
        return this.service.findAll(req.user.companyId, {
            exercice: exercice ? +exercice : undefined,
            mois:     mois     ? +mois     : undefined,
            utilise:  utilise  !== undefined ? utilise === 'true' : undefined,
        });
    }

    /* ── GET /ras-beneficiaire/credit-impot ──────────────────────── */
    @Get('credit-impot')
    @ApiOperation({ summary: 'Total crédit d\'impôt disponible pour la déclaration IS/IRPP annuelle' })
    @ApiQuery({ name: 'exercice', required: true, type: Number })
    getCreditImpot(
        @Request() req,
        @Query('exercice') exercice: string,
    ) {
        return this.service.getCreditImpot(req.user.companyId, +exercice);
    }

    /* ── GET /ras-beneficiaire/recap-annuel ──────────────────────── */
    @Get('recap-annuel')
    @ApiOperation({ summary: 'Récapitulatif annuel des certificats reçus par client' })
    @ApiQuery({ name: 'exercice', required: true, type: Number })
    getRecapAnnuel(
        @Request() req,
        @Query('exercice') exercice: string,
    ) {
        return this.service.getRecapAnnuel(req.user.companyId, +exercice);
    }

    /* ── GET /ras-beneficiaire/:id ───────────────────────────────── */
    @Get(':id')
    @ApiOperation({ summary: 'Obtenir un certificat RAS par ID' })
    findOne(@Param('id') id: string, @Request() req) {
        return this.service.findOne(id, req.user.companyId);
    }

    /* ── PATCH /ras-beneficiaire/:id ─────────────────────────────── */
    @Patch(':id')
    @ApiOperation({ summary: 'Mettre à jour un certificat RAS' })
    update(
        @Param('id') id: string,
        @Body(ValidationPipe) dto: UpdateRasBeneficiaireDto,
        @Request() req,
    ) {
        return this.service.update(id, req.user.companyId, dto);
    }

    /* ── PATCH /ras-beneficiaire/:id/utiliser ────────────────────── */
    @Patch(':id/utiliser')
    @ApiOperation({ summary: 'Marquer un certificat comme imputé sur l\'IS/IRPP annuel' })
    marquerUtilise(@Param('id') id: string, @Request() req) {
        return this.service.marquerUtilise(id, req.user.companyId);
    }

    /* ── DELETE /ras-beneficiaire/:id ────────────────────────────── */
    @Delete(':id')
    @ApiOperation({ summary: 'Supprimer un certificat RAS reçu' })
    remove(@Param('id') id: string, @Request() req) {
        return this.service.remove(id, req.user.companyId);
    }
}
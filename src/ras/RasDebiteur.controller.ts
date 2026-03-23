import {
    Controller, Get, Post, Patch, Delete,
    Param, Body, Query, Request, Res,
    HttpStatus, UseGuards, ValidationPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateRasDebiteurDto, UpdateRasDebiteurDto, ExportXmlDto } from './ras.dto';
import {RasDebiteurService} from "./rasDebiteur.service";

@ApiTags('RAS Débiteur')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('ras-debiteur')
export class RasDebiteurController {
    constructor(private readonly service: RasDebiteurService) {}

    /* ── POST /ras-debiteur ──────────────────────────────────────── */
    @Post()
    @ApiOperation({ summary: 'Créer une RAS débiteur (retenue sur achat fournisseur)' })
    create(
        @Body(ValidationPipe) dto: CreateRasDebiteurDto,
        @Request() req,
    ) {
        return this.service.create(dto, req.user.userId, req.user.companyId);
    }

    /* ── GET /ras-debiteur ───────────────────────────────────────── */
    @Get()
    @ApiOperation({ summary: 'Lister les RAS débiteur avec filtres optionnels' })
    @ApiQuery({ name: 'exercice', required: false, type: Number })
    @ApiQuery({ name: 'mois',     required: false, type: Number })
    @ApiQuery({ name: 'reversee', required: false, type: Boolean })
    findAll(
        @Request() req,
        @Query('exercice') exercice?: string,
        @Query('mois')     mois?:     string,
        @Query('reversee') reversee?: string,
    ) {
        return this.service.findAll(req.user.companyId, {
            exercice: exercice ? +exercice : undefined,
            mois:     mois     ? +mois     : undefined,
            reversee: reversee !== undefined ? reversee === 'true' : undefined,
        });
    }

    /* ── GET /ras-debiteur/recap ─────────────────────────────────── */
    @Get('recap')
    @ApiOperation({ summary: 'Récapitulatif mensuel : total RAS, reversées, non reversées' })
    @ApiQuery({ name: 'exercice', required: true, type: Number })
    @ApiQuery({ name: 'mois',     required: true, type: Number })
    getRecap(
        @Request() req,
        @Query('exercice') exercice: string,
        @Query('mois')     mois:     string,
    ) {
        return this.service.getRecap(req.user.companyId, +exercice, +mois);
    }

    /* ── GET /ras-debiteur/recap-annuel ──────────────────────────── */
    @Get('recap-annuel')
    @ApiOperation({ summary: 'Récapitulatif annuel par code opération' })
    @ApiQuery({ name: 'exercice', required: true, type: Number })
    getRecapAnnuel(
        @Request() req,
        @Query('exercice') exercice: string,
    ) {
        return this.service.getRecapAnnuel(req.user.companyId, +exercice);
    }

    /* ── GET /ras-debiteur/:id ───────────────────────────────────── */
    @Get(':id')
    @ApiOperation({ summary: 'Obtenir une RAS débiteur par ID' })
    findOne(@Param('id') id: string, @Request() req) {
        return this.service.findOne(id, req.user.companyId);
    }

    /* ── PATCH /ras-debiteur/:id ─────────────────────────────────── */
    @Patch(':id')
    @ApiOperation({ summary: 'Mettre à jour une RAS débiteur' })
    update(
        @Param('id') id: string,
        @Body(ValidationPipe) dto: UpdateRasDebiteurDto,
        @Request() req,
    ) {
        return this.service.update(id, req.user.companyId, dto);
    }

    /* ── PATCH /ras-debiteur/:id/reverser ────────────────────────── */
    @Patch(':id/reverser')
    @ApiOperation({ summary: 'Marquer une RAS comme reversée à l\'État (compte 4378 soldé)' })
    marquerReversee(@Param('id') id: string, @Request() req) {
        return this.service.marquerReversee(id, req.user.companyId);
    }

    /* ── DELETE /ras-debiteur/:id ────────────────────────────────── */
    @Delete(':id')
    @ApiOperation({ summary: 'Supprimer une RAS débiteur' })
    remove(@Param('id') id: string, @Request() req) {
        return this.service.remove(id, req.user.companyId);
    }

    /* ── POST /ras-debiteur/export-xml ──────────────────────────── */
    @Post('export-xml')
    @ApiOperation({ summary: 'Générer et télécharger le fichier XML conforme TEJ' })
    async exportXML(
        @Body(ValidationPipe) dto: ExportXmlDto,
        @Request() req,
        @Res() res: Response,
    ) {
        // Le matricule fiscal de la société doit être dans le profil company
        // ou dans le JWT — on le récupère depuis req.user ou la base
        const matricule = req.user.matriculeFiscal || 'MATRICULE_A_CONFIGURER';

        const xml = await this.service.generateXML(
            req.user.companyId,
            dto.exercice,
            dto.mois,
            dto.codeActe ?? 0,
            matricule,
        );

        const filename = `RAS-${dto.exercice}-${String(dto.mois).padStart(2, '0')}-${dto.codeActe ?? 0}.xml`;

        res.set({
            'Content-Type':        'application/xml; charset=utf-8',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Content-Length':      Buffer.byteLength(xml, 'utf8').toString(),
        });
        return res.status(HttpStatus.OK).send(xml);
    }
}
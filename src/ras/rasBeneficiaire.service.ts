import {
    Injectable,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateRasBeneficiaireDto, UpdateRasBeneficiaireDto } from './ras.dto';
import {RasBeneficiaire, RasBeneficiaireDocument} from "./rasBeneficiaire.schema";

@Injectable()
export class RasBeneficiaireService {
    constructor(
        @InjectModel(RasBeneficiaire.name)
        private readonly model: Model<RasBeneficiaireDocument>,
    ) {}

    /* ── Créer ───────────────────────────────────────────────────── */
    async create(
        dto:       CreateRasBeneficiaireDto,
        userId:    string,
        companyId: string,
    ): Promise<RasBeneficiaireDocument> {
        // Vérifier doublon sur numeroCertificatTEJ
        const existing = await this.model.findOne({
            numeroCertificatTEJ: dto.numeroCertificatTEJ,
            companyId:           new Types.ObjectId(companyId),
        });
        if (existing) {
            throw new BadRequestException(
                `Le certificat TEJ "${dto.numeroCertificatTEJ}" est déjà enregistré`,
            );
        }

        // Validation matricule fiscal client
        if (!/^\d{7}[A-Z]$/i.test(dto.matriculeClient)) {
            throw new BadRequestException(
                `Matricule fiscal client invalide "${dto.matriculeClient}". Format : 7 chiffres + 1 lettre`,
            );
        }

        // Validation cohérence montant RAS
        const expected = +(dto.montantBrut * dto.tauxRAS / 100).toFixed(3);
        if (Math.abs(expected - dto.montantRAS) > 0.002) {
            throw new BadRequestException(
                `MontantRS incohérent : attendu ${expected} DT, reçu ${dto.montantRAS} DT`,
            );
        }

        const doc = new this.model({
            ...dto,
            dateEncaissement: new Date(dto.dateEncaissement),
            companyId:        new Types.ObjectId(companyId),
            createdBy:        new Types.ObjectId(userId),
            ...(dto.venteId  && { venteId:  new Types.ObjectId(dto.venteId) }),
            ...(dto.clientId && { clientId: new Types.ObjectId(dto.clientId) }),
        });
        return doc.save();
    }

    /* ── Lister ──────────────────────────────────────────────────── */
    async findAll(
        companyId: string,
        filters?: {
            exercice?: number;
            mois?:     number;
            utilise?:  boolean;
        },
    ): Promise<RasBeneficiaireDocument[]> {
        const q: any = { companyId: new Types.ObjectId(companyId) };
        if (filters?.exercice !== undefined) q.exercice = filters.exercice;
        if (filters?.mois     !== undefined) q.mois     = filters.mois;
        if (filters?.utilise  !== undefined) q.utilise  = filters.utilise;
        return this.model.find(q).sort({ dateEncaissement: -1 }).exec();
    }

    /* ── Trouver un ──────────────────────────────────────────────── */
    async findOne(id: string, companyId: string): Promise<RasBeneficiaireDocument> {
        const doc = await this.model.findOne({
            _id:       new Types.ObjectId(id),
            companyId: new Types.ObjectId(companyId),
        });
        if (!doc) throw new NotFoundException('Certificat RAS introuvable');
        return doc;
    }

    /* ── Mettre à jour ───────────────────────────────────────────── */
    async update(
        id:        string,
        companyId: string,
        dto:       UpdateRasBeneficiaireDto,
    ): Promise<RasBeneficiaireDocument> {
        const doc = await this.model.findOneAndUpdate(
            { _id: new Types.ObjectId(id), companyId: new Types.ObjectId(companyId) },
            { $set: dto },
            { new: true },
        );
        if (!doc) throw new NotFoundException('Certificat RAS introuvable');
        return doc;
    }

    /* ── Marquer comme utilisé (imputé sur IS/IRPP) ──────────────── */
    async marquerUtilise(id: string, companyId: string): Promise<RasBeneficiaireDocument> {
        const doc = await this.model.findOneAndUpdate(
            { _id: new Types.ObjectId(id), companyId: new Types.ObjectId(companyId) },
            { $set: { utilise: true } },
            { new: true },
        );
        if (!doc) throw new NotFoundException('Certificat RAS introuvable');
        return doc;
    }

    /* ── Supprimer ───────────────────────────────────────────────── */
    async remove(id: string, companyId: string): Promise<void> {
        const doc = await this.model.findOneAndDelete({
            _id:       new Types.ObjectId(id),
            companyId: new Types.ObjectId(companyId),
        });
        if (!doc) throw new NotFoundException('Certificat RAS introuvable');
    }

    /* ── Crédit d'impôt annuel disponible ────────────────────────── */
    async getCreditImpot(companyId: string, exercice: number) {
        const rows = await this.model.aggregate([
            {
                $match: {
                    companyId: new Types.ObjectId(companyId),
                    exercice,
                },
            },
            {
                $group: {
                    _id:      null,
                    total:    { $sum: '$montantRAS' },
                    utilise:  { $sum: { $cond: ['$utilise', '$montantRAS', 0] } },
                    count:    { $sum: 1 },
                },
            },
        ]);
        const r = rows[0] || { total: 0, utilise: 0, count: 0 };
        return {
            exercice,
            total:       +r.total.toFixed(3),
            utilise:     +r.utilise.toFixed(3),
            disponible:  +(r.total - r.utilise).toFixed(3),
            count:       r.count,
        };
    }

    /* ── Récapitulatif mensuel ───────────────────────────────────── */
    async getRecapMensuel(companyId: string, exercice: number, mois: number) {
        const rows = await this.model.aggregate([
            {
                $match: {
                    companyId: new Types.ObjectId(companyId),
                    exercice,
                    mois,
                },
            },
            {
                $group: {
                    _id:       null,
                    totalRAS:  { $sum: '$montantRAS' },
                    totalBrut: { $sum: '$montantBrut' },
                    count:     { $sum: 1 },
                },
            },
        ]);
        const r = rows[0] || { totalRAS: 0, totalBrut: 0, count: 0 };
        return { ...r, exercice, mois };
    }

    /* ── Récapitulatif annuel par client ─────────────────────────── */
    async getRecapAnnuel(companyId: string, exercice: number) {
        return this.model.aggregate([
            {
                $match: {
                    companyId: new Types.ObjectId(companyId),
                    exercice,
                },
            },
            {
                $group: {
                    _id:       '$clientName',
                    totalRAS:  { $sum: '$montantRAS' },
                    count:     { $sum: 1 },
                    utilise:   { $sum: { $cond: ['$utilise', '$montantRAS', 0] } },
                },
            },
            { $sort: { totalRAS: -1 } },
        ]);
    }
}
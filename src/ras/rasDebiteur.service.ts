import {
    Injectable,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateRasDebiteurDto, UpdateRasDebiteurDto } from './ras.dto';
import {RasDebiteur, RasDebiteurDocument} from "./rasDebiteur.schema";

@Injectable()
export class RasDebiteurService {
    constructor(
        @InjectModel(RasDebiteur.name)
        private readonly model: Model<RasDebiteurDocument>,
    ) {}

    /* ── Créer ───────────────────────────────────────────────────── */
    async create(
        dto:       CreateRasDebiteurDto,
        userId:    string,
        companyId: string,
    ): Promise<RasDebiteurDocument> {
        // Validation cohérence montant
        const expected = +(dto.montantBrut * dto.tauxRAS / 100).toFixed(3);
        if (Math.abs(expected - dto.montantRAS) > 0.002) {
            throw new BadRequestException(
                `MontantRS incohérent : attendu ${expected} DT, reçu ${dto.montantRAS} DT`,
            );
        }

        // Validation matricule fiscal (7 chiffres + 1 lettre)
        if (!/^\d{7}[A-Z]$/i.test(dto.matriculeFournisseur)) {
            throw new BadRequestException(
                `Matricule fiscal invalide "${dto.matriculeFournisseur}". Format : 7 chiffres + 1 lettre (ex : 1234567W)`,
            );
        }

        // Validation mois/date cohérence
        const datePmt  = new Date(dto.datePaiement);
        const moisDate = datePmt.getMonth() + 1;
        const annee    = datePmt.getFullYear();
        if (moisDate !== dto.mois || annee !== dto.exercice) {
            throw new BadRequestException(
                `La date de paiement (${dto.datePaiement}) ne correspond pas à la période déclarée (${dto.exercice}/${dto.mois})`,
            );
        }

        const doc = new this.model({
            ...dto,
            datePaiement: datePmt,
            companyId:    new Types.ObjectId(companyId),
            createdBy:    new Types.ObjectId(userId),
            ...(dto.achatId       && { achatId:       new Types.ObjectId(dto.achatId) }),
            ...(dto.fournisseurId && { fournisseurId: new Types.ObjectId(dto.fournisseurId) }),
        });
        return doc.save();
    }

    /* ── Lister ──────────────────────────────────────────────────── */
    async findAll(
        companyId: string,
        filters?: {
            exercice?: number;
            mois?:     number;
            reversee?: boolean;
        },
    ): Promise<RasDebiteurDocument[]> {
        const q: any = { companyId: new Types.ObjectId(companyId) };
        if (filters?.exercice !== undefined) q.exercice = filters.exercice;
        if (filters?.mois     !== undefined) q.mois     = filters.mois;
        if (filters?.reversee !== undefined) q.reversee = filters.reversee;
        return this.model.find(q).sort({ datePaiement: -1 }).exec();
    }

    /* ── Trouver un ──────────────────────────────────────────────── */
    async findOne(id: string, companyId: string): Promise<RasDebiteurDocument> {
        const doc = await this.model.findOne({
            _id:       new Types.ObjectId(id),
            companyId: new Types.ObjectId(companyId),
        });
        if (!doc) throw new NotFoundException('RAS débiteur introuvable');
        return doc;
    }

    /* ── Mettre à jour ───────────────────────────────────────────── */
    async update(
        id:        string,
        companyId: string,
        dto:       UpdateRasDebiteurDto,
    ): Promise<RasDebiteurDocument> {
        const doc = await this.model.findOneAndUpdate(
            { _id: new Types.ObjectId(id), companyId: new Types.ObjectId(companyId) },
            { $set: dto },
            { new: true },
        );
        if (!doc) throw new NotFoundException('RAS débiteur introuvable');
        return doc;
    }

    /* ── Marquer comme reversée ──────────────────────────────────── */
    async marquerReversee(id: string, companyId: string): Promise<RasDebiteurDocument> {
        const doc = await this.model.findOneAndUpdate(
            { _id: new Types.ObjectId(id), companyId: new Types.ObjectId(companyId) },
            { $set: { reversee: true } },
            { new: true },
        );
        if (!doc) throw new NotFoundException('RAS débiteur introuvable');
        return doc;
    }

    /* ── Supprimer ───────────────────────────────────────────────── */
    async remove(id: string, companyId: string): Promise<void> {
        const doc = await this.model.findOneAndDelete({
            _id:       new Types.ObjectId(id),
            companyId: new Types.ObjectId(companyId),
        });
        if (!doc) throw new NotFoundException('RAS débiteur introuvable');
    }

    /* ── Récapitulatif mensuel ───────────────────────────────────── */
    async getRecap(companyId: string, exercice: number, mois: number) {
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
                    _id:             null,
                    totalBrut:       { $sum: '$montantBrut' },
                    totalRAS:        { $sum: '$montantRAS' },
                    totalNetPaye:    { $sum: '$netPaye' },
                    totalReversees:  { $sum: { $cond: ['$reversee', '$montantRAS', 0] } },
                    count:           { $sum: 1 },
                    countReversees:  { $sum: { $cond: ['$reversee', 1, 0] } },
                },
            },
        ]);
        const r = rows[0] || {
            totalBrut: 0, totalRAS: 0, totalNetPaye: 0,
            totalReversees: 0, count: 0, countReversees: 0,
        };
        return {
            ...r,
            nonReversees:      +(r.totalRAS - r.totalReversees).toFixed(3),
            countNonReversees: r.count - r.countReversees,
            exercice,
            mois,
        };
    }

    /* ── Récapitulatif annuel par code opération ─────────────────── */
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
                    _id:         '$codeOperation',
                    totalBrut:   { $sum: '$montantBrut' },
                    totalRAS:    { $sum: '$montantRAS' },
                    count:       { $sum: 1 },
                },
            },
            { $sort: { totalRAS: -1 } },
        ]);
    }

    /* ── Générer le XML TEJ ──────────────────────────────────────── */
    async generateXML(
        companyId:        string,
        exercice:         number,
        mois:             number,
        codeActe:         0 | 1,
        matriculeSociete: string,
    ): Promise<string> {
        const rows = await this.findAll(companyId, { exercice, mois });

        if (rows.length === 0) {
            throw new BadRequestException(
                `Aucune RAS pour la période ${exercice}/${String(mois).padStart(2, '0')}`,
            );
        }

        const totalBrut = rows.reduce((s, r) => s + r.montantBrut, 0);
        const totalRS   = rows.reduce((s, r) => s + r.montantRAS,  0);

        const certificats = rows.map(r => `
    <Certificat>
      <MatriculeDebiteur>${matriculeSociete.toUpperCase()}</MatriculeDebiteur>
      <CodeEtabDebiteur>000</CodeEtabDebiteur>
      <MatriculeBeneficiaire>${r.matriculeFournisseur.toUpperCase()}</MatriculeBeneficiaire>
      <CodeEtabBeneficiaire>000</CodeEtabBeneficiaire>
      <CodeOperation>${r.codeOperation}</CodeOperation>
      <MontantBrut>${r.montantBrut.toFixed(3)}</MontantBrut>
      <TauxRS>${r.tauxRAS.toFixed(3)}</TauxRS>
      <MontantRS>${r.montantRAS.toFixed(3)}</MontantRS>
      <DatePaiement>${new Date(r.datePaiement).toISOString().substring(0, 10)}</DatePaiement>
    </Certificat>`).join('');

        return `<?xml version="1.0" encoding="UTF-8"?>
<DeclarationRS xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xsi:noNamespaceSchemaLocation="TEJDeclarationRS_v1.0.xsd">

  <ReferenceDeclaration>
    <MatriculeFiscal>${matriculeSociete.toUpperCase()}</MatriculeFiscal>
    <CodeEtablissement>000</CodeEtablissement>
    <Exercice>${exercice}</Exercice>
    <Mois>${String(mois).padStart(2, '0')}</Mois>
    <CodeActe>${codeActe}</CodeActe>
  </ReferenceDeclaration>

  <Certificats>${certificats}
  </Certificats>

  <TotalDeclaration>
    <NombreCertificats>${rows.length}</NombreCertificats>
    <TotalMontantBrut>${totalBrut.toFixed(3)}</TotalMontantBrut>
    <TotalMontantRS>${totalRS.toFixed(3)}</TotalMontantRS>
  </TotalDeclaration>

</DeclarationRS>`;
    }
}
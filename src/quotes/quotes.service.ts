import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Quote, QuoteDocument, QuoteStatus } from './quote.schema';

// Interface locale pour les calculs — évite any[]
interface RawItem {
  productId?: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  tva?: number;
}

interface ComputedItem {
  productId?: Types.ObjectId;
  productName: string;
  quantity: number;
  unitPrice: number;
  tva: number;
  totalHT: number;
  totalTVA: number;
  totalTTC: number;
}

interface QuoteTotals {
  items:    ComputedItem[];
  totalHT:  number;
  totalTVA: number;
  totalTTC: number;
}

@Injectable()
export class QuotesService {
  constructor(
      @InjectModel(Quote.name)  private quoteModel:  Model<QuoteDocument>,
      @InjectModel('Vente')     private venteModel:  Model<any>,
      @InjectModel('Client')    private clientModel: Model<any>, // pour création auto client
  ) {}

  // ── Helper : calcule les montants ligne par ligne ──────────────────────────
  private computeItems(rawItems: RawItem[]): QuoteTotals {
    let totalHT  = 0;
    let totalTVA = 0;
    let totalTTC = 0;

    const items: ComputedItem[] = (rawItems || []).map((item) => {
      if (!item.productName)
        throw new BadRequestException('productName est obligatoire sur chaque ligne');
      if (!item.quantity || item.quantity <= 0)
        throw new BadRequestException('quantity doit être > 0');
      if (item.unitPrice < 0)
        throw new BadRequestException('unitPrice ne peut pas être négatif');

      const tva     = item.tva ?? 19;
      const lineHT  = +(item.quantity * item.unitPrice).toFixed(3);
      const lineTVA = +(lineHT * (tva / 100)).toFixed(3);
      const lineTTC = +(lineHT + lineTVA).toFixed(3);

      totalHT  += lineHT;
      totalTVA += lineTVA;
      totalTTC += lineTTC;

      return {
        productId:   item.productId ? new Types.ObjectId(item.productId) : undefined,
        productName: item.productName,
        quantity:    item.quantity,
        unitPrice:   item.unitPrice,
        tva,
        totalHT:  lineHT,
        totalTVA: lineTVA,
        totalTTC: lineTTC,
      };
    });

    return {
      items,
      totalHT:  +totalHT.toFixed(3),
      totalTVA: +totalTVA.toFixed(3),
      totalTTC: +totalTTC.toFixed(3),
    };
  }

  // ── Génère un numéro de devis séquentiel : DEV-2024-0042 ──────────────────
  private async generateQuoteNumber(companyId: string): Promise<string> {
    const year   = new Date().getFullYear();
    const prefix = `DEV-${year}-`;
    const last   = await this.quoteModel
        .findOne(
            { companyId: new Types.ObjectId(companyId), quoteNumber: { $regex: `^${prefix}` } },
        )
        .sort({ quoteNumber: -1 })
        .select('quoteNumber')
        .lean();

    let seq = 1;
    if (last?.quoteNumber) {
      const parts = (last.quoteNumber as string).split('-');
      seq = parseInt(parts[parts.length - 1], 10) + 1;
    }
    return `${prefix}${String(seq).padStart(4, '0')}`;
  }

  // ── CREATE ─────────────────────────────────────────────────────────────────
  async create(
      dto: any,
      userId: string,
      userName: string,
      companyId: string,
  ): Promise<QuoteDocument> {
    if (!dto.items?.length)
      throw new BadRequestException('Le devis doit contenir au moins une ligne');

    const { items, totalHT, totalTVA, totalTTC } = this.computeItems(dto.items);
    const quoteNumber = await this.generateQuoteNumber(companyId);

    const quote = new this.quoteModel({
      clientName:    dto.clientName,
      clientPhone:   dto.clientPhone,
      clientEmail:   dto.clientEmail,
      clientAddress: dto.clientAddress,
      clientId:      dto.clientId ? new Types.ObjectId(dto.clientId) : undefined,
      items,
      totalHT,
      totalTVA,
      totalTTC,
      quoteNumber,
      validUntil:    dto.validUntil ? new Date(dto.validUntil) : undefined,
      notes:         dto.notes,
      status:        QuoteStatus.DRAFT,
      companyId:     new Types.ObjectId(companyId),
      createdBy:     new Types.ObjectId(userId),
      createdByName: userName,
    });

    return quote.save();
  }

  // ── FIND ALL ───────────────────────────────────────────────────────────────
  async findAll(
      companyId: string,
      query?: { search?: string; status?: string },
  ): Promise<QuoteDocument[]> {
    const filter: any = { companyId: new Types.ObjectId(companyId) };

    if (query?.search) {
      filter.$or = [
        { clientName:    { $regex: query.search, $options: 'i' } },
        { createdByName: { $regex: query.search, $options: 'i' } },
        { quoteNumber:   { $regex: query.search, $options: 'i' } },
      ];
    }
    if (query?.status) filter.status = query.status;

    return this.quoteModel.find(filter).sort({ createdAt: -1 }).exec();
  }

  // ── FIND ONE ───────────────────────────────────────────────────────────────
  async findOne(id: string, companyId: string): Promise<QuoteDocument> {
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException('ID invalide');

    const q = await this.quoteModel.findOne({
      _id:       new Types.ObjectId(id),
      companyId: new Types.ObjectId(companyId),
    });
    if (!q) throw new NotFoundException('Devis introuvable');
    return q;
  }

  // ── UPDATE ─────────────────────────────────────────────────────────────────
  async update(id: string, companyId: string, dto: any): Promise<QuoteDocument> {
    const updatePayload: any = { ...dto };

    if (dto.items?.length) {
      const { items, totalHT, totalTVA, totalTTC } = this.computeItems(dto.items);
      updatePayload.items    = items;
      updatePayload.totalHT  = totalHT;
      updatePayload.totalTVA = totalTVA;
      updatePayload.totalTTC = totalTTC;
    }

    // Sécurité : champs système non modifiables depuis le client
    delete updatePayload.companyId;
    delete updatePayload.createdBy;

    const q = await this.quoteModel.findOneAndUpdate(
        { _id: new Types.ObjectId(id), companyId: new Types.ObjectId(companyId) },
        { $set: updatePayload },
        { new: true },
    );
    if (!q) throw new NotFoundException('Devis introuvable');
    return q;
  }

  // ── REMOVE ─────────────────────────────────────────────────────────────────
  async remove(id: string, companyId: string): Promise<void> {
    const q = await this.quoteModel.findOneAndDelete({
      _id:       new Types.ObjectId(id),
      companyId: new Types.ObjectId(companyId),
    });
    if (!q) throw new NotFoundException('Devis introuvable');
  }

  // ── CONVERT TO SALE ────────────────────────────────────────────────────────
  async convertToSale(
      id: string,
      companyId: string,
      userId: string,
      userName: string,
  ): Promise<any> {
    const quote = await this.findOne(id, companyId);

    // ── Validations statut ──────────────────────────────────────────────────
    if (quote.status === QuoteStatus.REJECTED)
      throw new BadRequestException('Impossible de convertir un devis rejeté');
    if (quote.status === QuoteStatus.EXPIRED)
      throw new BadRequestException('Impossible de convertir un devis expiré');
    if (quote.status === QuoteStatus.ACCEPTED)
      throw new BadRequestException('Ce devis a déjà été converti en vente');

    // ── Résolution du clientId (toujours required dans Vente) ──────────────
    //
    //  Priorité 1 : clientId déjà lié au devis        → réutilisation directe
    //  Priorité 2 : recherche par téléphone en base    → évite les doublons
    //  Priorité 3 : création automatique du client     → depuis les champs du devis

    let resolvedClientId: Types.ObjectId;

    if (quote.clientId) {
      // ── Priorité 1 ────────────────────────────────────────────────────────
      resolvedClientId = quote.clientId as Types.ObjectId;

    } else {
      let existingClient: any = null;

      // ── Priorité 2 : cherche par téléphone si disponible ──────────────────
      if (quote.clientPhone?.trim()) {
        existingClient = await this.clientModel
            .findOne({
              phone:     quote.clientPhone.trim(),
              companyId: new Types.ObjectId(companyId),
            })
            .lean();
      }

      if (existingClient) {
        // Client trouvé en base → on le réutilise
        resolvedClientId = existingClient._id as Types.ObjectId;

      } else {
        // ── Priorité 3 : création automatique du client ────────────────────
        //
        // Client.phone est required dans le schema → si le devis n'a pas de
        // téléphone, on génère un identifiant unique pour éviter l'erreur de
        // validation tout en gardant un enregistrement propre.
        const phone = quote.clientPhone?.trim()
            || `DV-${(quote.quoteNumber || quote._id.toString())
                .replace(/[^A-Z0-9]/gi, '')
                .toUpperCase()}`;

        const newClient = new this.clientModel({
          name:          quote.clientName,
          phone,
          email:         quote.clientEmail || '',
          notes:         [
            quote.clientAddress ? `Adresse : ${quote.clientAddress}` : '',
            `Créé automatiquement depuis devis ${quote.quoteNumber}`,
          ].filter(Boolean).join(' — '),
          isActive:      true,
          creditLimit:   0,
          creditUsed:    0,
          companyId:     new Types.ObjectId(companyId),
          createdBy:     new Types.ObjectId(userId),
          createdByName: userName,
        });

        const savedClient = await newClient.save();
        resolvedClientId  = savedClient._id as Types.ObjectId;

        // Lier rétroactivement le nouveau client au devis
        await this.quoteModel.findByIdAndUpdate(quote._id, {
          $set: { clientId: resolvedClientId },
        });
      }
    }

    // ── Création de la vente ────────────────────────────────────────────────
    const vente = new this.venteModel({
      clientId:        resolvedClientId,       // toujours défini ici
      clientName:      quote.clientName,
      clientPhone:     quote.clientPhone,
      clientEmail:     quote.clientEmail,
      clientAddress:   quote.clientAddress,
      items:           quote.items,
      totalHT:         quote.totalHT,
      totalTVA:        quote.totalTVA,
      totalTTC:        quote.totalTTC,
      amountPaid:      0,
      amountRemaining: quote.totalTTC,
      notes: quote.notes
          ? `[Devis ${quote.quoteNumber}] ${quote.notes}`
          : `Convertie depuis devis ${quote.quoteNumber}`,
      status:          'pending',
      quoteId:         quote._id,              // traçabilité devis → vente
      companyId:       new Types.ObjectId(companyId),
      createdBy:       new Types.ObjectId(userId),
      createdByName:   userName,
    });

    const savedVente = await vente.save();

    // ── Clôture du devis ───────────────────────────────────────────────────
    await this.quoteModel.findByIdAndUpdate(quote._id, {
      $set: {
        status:          QuoteStatus.ACCEPTED,
        convertedSaleId: savedVente._id,
      },
    });

    return {
      message:  `Devis ${quote.quoteNumber} converti en vente avec succès`,
      saleId:   savedVente._id.toString(),
      clientId: resolvedClientId.toString(),
      sale:     savedVente,
    };
  }
}
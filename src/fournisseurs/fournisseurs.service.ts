import {
  Injectable,
  NotFoundException,
  ConflictException,
  forwardRef,
  Inject,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Fournisseur, FournisseurDocument } from './fournisseur.schema';
import { Purchase } from '../purchases/purchase.schema';
import { ProductsService } from '../products/products.service';
import { PaymentAchatService } from '../payment-achat/payment-achat.service';

@Injectable()
export class FournisseursService {
  constructor(
      @InjectModel(Fournisseur.name)
      private fournisseurModel: Model<FournisseurDocument>,

      @InjectModel(Purchase.name)
      private purchaseModel: Model<any>,

      @Inject(forwardRef(() => ProductsService))
      private productsService: ProductsService,

      @Inject(forwardRef(() => PaymentAchatService))
      private paymentAchatService: PaymentAchatService,
  ) {}

  /* ── Créer un fournisseur ─────────────────────────────────────────────── */
  async create(
      dto: any,
      userId: string,
      userName: string,
      companyId: string,
  ): Promise<FournisseurDocument> {
    if (!companyId) throw new BadRequestException('companyId manquant dans le token JWT');

    const existing = await this.fournisseurModel.findOne({
      phone:     dto.phone,
      companyId: new Types.ObjectId(companyId),
    });
    if (existing) throw new ConflictException('Ce fournisseur existe déjà (même téléphone)');

    const f = new this.fournisseurModel({
      ...dto,
      companyId:     new Types.ObjectId(companyId),
      createdBy:     new Types.ObjectId(userId),
      createdByName: userName,
    });
    return f.save();
  }

  /* ── Lister les fournisseurs ──────────────────────────────────────────── */
  async findAll(companyId: string, query?: any): Promise<any[]> {
    if (!companyId) throw new BadRequestException('companyId manquant dans le token JWT');

    const filter: any = { companyId: new Types.ObjectId(companyId) };
    if (query?.search) {
      filter.$or = [
        { name:  { $regex: query.search, $options: 'i' } },
        { phone: { $regex: query.search, $options: 'i' } },
      ];
    }
    const sort: any = query?.sortBy
        ? { [query.sortBy]: query.sortOrder === 'desc' ? -1 : 1 }
        : { createdAt: -1 };

    const fournisseurs = await this.fournisseurModel
        .find(filter)
        .sort(sort)
        .populate('products', 'name unit purchasePrice tva stockQuantity stockThreshold')
        .lean()
        .exec();

    if (!fournisseurs.length) return [];

    const ids = fournisseurs.map((f: any) => new Types.ObjectId(f._id));

    const [revenueRows, paymentsMap] = await Promise.all([
      this.purchaseModel.aggregate([
        {
          $match: {
            FournisseurId: { $in: ids },
            companyId:     new Types.ObjectId(companyId),
          },
        },
        {
          $group: {
            _id:        '$FournisseurId',
            totalSpent: { $sum: '$totalTTC' },
            count:      { $sum: 1 },
          },
        },
      ]),
      this.paymentAchatService.aggregateByFournisseurs(ids, companyId),
    ]);

    const revenueMap = new Map<string, { totalSpent: number; count: number }>();
    for (const row of revenueRows) {
      revenueMap.set(row._id.toString(), {
        totalSpent: row.totalSpent,
        count:      row.count,
      });
    }

    return fournisseurs.map((f: any) => {
      const id         = f._id.toString();
      const totalSpent = revenueMap.get(id)?.totalSpent ?? 0;
      const count      = revenueMap.get(id)?.count      ?? 0;
      const totalPaid  = paymentsMap.get(id)            ?? 0;
      const totalDebt  = totalSpent - totalPaid;

      return {
        ...f,
        totalSpent,
        totalPaid,
        totalDebt: Math.max(0, totalDebt),
        purchasesCount: count,
      };
    });
  }

  /* ── Récupérer un fournisseur ─────────────────────────────────────────── */
  async findOne(id: string, companyId: string): Promise<FournisseurDocument> {
    if (!companyId) throw new BadRequestException('companyId manquant dans le token JWT');

    const f = await this.fournisseurModel
        .findOne({
          _id:       new Types.ObjectId(id),
          companyId: new Types.ObjectId(companyId),
        })
        .populate('products', 'name unit purchasePrice tva stockQuantity stockThreshold');
    if (!f) throw new NotFoundException('Fournisseur introuvable');
    return f;
  }

  /* ── Modifier un fournisseur ──────────────────────────────────────────── */
  async update(
      id: string,
      companyId: string,
      dto: any,
      userId: string,
      userName: string,
  ): Promise<FournisseurDocument> {
    const f = await this.fournisseurModel
        .findOneAndUpdate(
            { _id: new Types.ObjectId(id), companyId: new Types.ObjectId(companyId) },
            {
              ...dto,
              updatedBy:     new Types.ObjectId(userId),
              updatedByName: userName,
            },
            { new: true },
        )
        .populate('products', 'name unit purchasePrice tva stockQuantity stockThreshold');
    if (!f) throw new NotFoundException('Fournisseur introuvable');
    return f;
  }

  /* ── Supprimer un fournisseur ─────────────────────────────────────────── */
  async remove(id: string, companyId: string): Promise<void> {
    const f = await this.fournisseurModel.findOneAndDelete({
      _id:       new Types.ObjectId(id),
      companyId: new Types.ObjectId(companyId),
    });
    if (!f) throw new NotFoundException('Fournisseur introuvable');
  }

  /* ── Mettre à jour la dette ───────────────────────────────────────────── */
  async updateDebt(id: string, amount: number, companyId: string): Promise<void> {
    await this.fournisseurModel.findOneAndUpdate(
        { _id: new Types.ObjectId(id), companyId: new Types.ObjectId(companyId) },
        { $inc: { totalDebt: amount } },
    );
  }

  /* ── Achats + paiements d'un fournisseur ──────────────────────────────── */
  async getPurchases(
      fournisseurId: string,
      companyId: string,
      query?: { startDate?: string; endDate?: string; status?: string },
  ) {
    if (!companyId) throw new BadRequestException('companyId manquant dans le token JWT');
    if (!Types.ObjectId.isValid(fournisseurId))
      throw new BadRequestException('fournisseurId invalide');

    const fournisseur = await this.fournisseurModel.findOne({
      _id:       new Types.ObjectId(fournisseurId),
      companyId: new Types.ObjectId(companyId),
    });
    if (!fournisseur) throw new NotFoundException('Fournisseur introuvable');

    // ── Tous les paiements du fournisseur (source de vérité) ──
    const allPayments = await this.paymentAchatService.findByFournisseur(
        fournisseurId,
        companyId,
    );

    // ── Tous les achats (pour stats globales) ──
    const allPurchases = await this.purchaseModel
        .find({
          FournisseurId: new Types.ObjectId(fournisseurId),
          companyId:     new Types.ObjectId(companyId),
        })
        .sort({ createdAt: -1 })
        .lean()
        .exec();

    // ── Stats globales (solde réel) ──
    const globalTotalSpent = allPurchases.reduce((s, p) => s + (p.totalTTC || 0), 0);
    const globalTotalPaid  = allPayments.reduce((s, p) => s + (p.amount   || 0), 0);
    const globalTotalDebt  = Math.max(0, globalTotalSpent - globalTotalPaid);

    // ── Construire une map : achatId -> montant total payé pour cet achat ──
    const paidPerAchat = new Map<string, number>();
    for (const pmt of allPayments) {
      const achatId = pmt.achatId?.toString();
      // Ignorer les paiements directs (achatId fictif nul)
      if (!achatId || achatId === '000000000000000000000000') continue;
      paidPerAchat.set(achatId, (paidPerAchat.get(achatId) ?? 0) + (pmt.amount || 0));
    }

    // ── Paiements directs (sans achat lié) ──
    const directPayments = allPayments.filter(
        p => !p.achatId || p.achatId.toString() === '000000000000000000000000',
    );

    // ── Recalculer amountPaid / amountRemaining / status sur chaque achat ──
    const enrichedPurchases = allPurchases.map((p: any) => {
      const achatId        = p._id.toString();
      const paidForThisAchat = paidPerAchat.get(achatId) ?? 0;
      const remaining      = Math.max(0, p.totalTTC - paidForThisAchat);
      const status         = remaining <= 0
          ? 'paid'
          : paidForThisAchat > 0
              ? 'partial'
              : 'pending';

      // Paiements liés à cet achat (pour affichage dans la facture)
      const linkedPayments = allPayments.filter(
          pmt => pmt.achatId?.toString() === achatId,
      );

      return {
        ...p,
        amountPaid:      paidForThisAchat,
        amountRemaining: remaining,
        status,
        linkedPayments,  // ← liste des paiements pour la facture PDF
      };
    });

    // ── Filtrer par date si demandé (pour l'affichage/export) ──
    let filteredPurchases = enrichedPurchases;
    if (query?.startDate || query?.endDate || query?.status) {
      filteredPurchases = enrichedPurchases.filter((p: any) => {
        const date = new Date(p.createdAt);
        if (query?.startDate && date < new Date(query.startDate)) return false;
        if (query?.endDate) {
          const end = new Date(query.endDate);
          end.setHours(23, 59, 59, 999);
          if (date > end) return false;
        }
        if (query?.status && p.status !== query.status) return false;
        return true;
      });
    }

    return {
      fournisseur: {
        _id:     fournisseur._id,
        name:    fournisseur.name,
        phone:   fournisseur.phone,
        email:   fournisseur.email,
        address: fournisseur.address,
      },
      purchases:      filteredPurchases,
      payments:       allPayments,
      directPayments, // ← paiements sans achat lié
      stats: {
        totalSpent: globalTotalSpent,
        totalPaid:  globalTotalPaid,
        totalDebt:  globalTotalDebt,
        count:      allPurchases.length,
      },
    };
  }

  /* ── Paiement direct sur un fournisseur (sans achat lié) ─────────────── */
  async addDirectPayment(
      fournisseurId: string,
      companyId: string,
      amount: number,
      note: string,
      userId: string,
  ): Promise<any> {
    if (!Types.ObjectId.isValid(fournisseurId))
      throw new BadRequestException('fournisseurId invalide');

    const f = await this.fournisseurModel.findOne({
      _id:       new Types.ObjectId(fournisseurId),
      companyId: new Types.ObjectId(companyId),
    });
    if (!f) throw new NotFoundException('Fournisseur introuvable');

    const payment = await this.paymentAchatService.createFromAchat(
        userId,
        fournisseurId,
        amount,
        '000000000000000000000000',
        companyId,
        note,
    );

    return payment;
  }

  /* ── Associer un produit à un fournisseur ────────────────────────────── */
  async addProduct(
      fournisseurId: string,
      productId: string,
      companyId: string,
  ): Promise<FournisseurDocument> {
    if (!Types.ObjectId.isValid(fournisseurId) || !Types.ObjectId.isValid(productId))
      throw new BadRequestException('ID fournisseur ou produit invalide');

    const updated = await this.fournisseurModel
        .findOneAndUpdate(
            { _id: new Types.ObjectId(fournisseurId), companyId: new Types.ObjectId(companyId) },
            { $addToSet: { products: new Types.ObjectId(productId) } },
            { new: true },
        )
        .populate('products', 'name unit purchasePrice tva stockQuantity stockThreshold');

    if (!updated) throw new NotFoundException('Fournisseur introuvable');
    return updated;
  }

  /* ── Retirer un produit d'un fournisseur ─────────────────────────────── */
  async removeProduct(
      fournisseurId: string,
      productId: string,
      companyId: string,
  ): Promise<FournisseurDocument> {
    const updated = await this.fournisseurModel
        .findOneAndUpdate(
            { _id: new Types.ObjectId(fournisseurId), companyId: new Types.ObjectId(companyId) },
            { $pull: { products: new Types.ObjectId(productId) } },
            { new: true },
        )
        .populate('products', 'name unit purchasePrice tva stockQuantity stockThreshold');

    if (!updated) throw new NotFoundException('Fournisseur introuvable');
    return updated;
  }
}
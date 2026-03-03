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

@Injectable()
export class FournisseursService {
  constructor(
      @InjectModel(Fournisseur.name)
      private fournisseurModel: Model<FournisseurDocument>,
      @InjectModel(Purchase.name)
      private purchaseModel: Model<any>,
      @Inject(forwardRef(() => ProductsService))
      private productsService: ProductsService,
  ) {}

  // ── Créer un fournisseur ─────────────────────────────────────────────────
  async create(dto: any, userId: string, userName: string, companyId: string): Promise<FournisseurDocument> {
    if (!companyId) throw new BadRequestException('companyId manquant dans le token JWT');

    const existing = await this.fournisseurModel.findOne({
      phone: dto.phone,
      companyId: new Types.ObjectId(companyId),
    });
    if (existing) throw new ConflictException('Ce fournisseur existe déjà (même téléphone)');

    const f = new this.fournisseurModel({
      ...dto,
      companyId: new Types.ObjectId(companyId),
      createdBy: new Types.ObjectId(userId),
      createdByName: userName,
    });
    return f.save();
  }

  // ── Lister les fournisseurs de la company (produits populés) ─────────────
  async findAll(companyId: string, query?: any): Promise<FournisseurDocument[]> {
    if (!companyId) throw new BadRequestException('companyId manquant dans le token JWT');

    const filter: any = { companyId: new Types.ObjectId(companyId) };
    if (query?.search)
      filter.$or = [
        { name: { $regex: query.search, $options: 'i' } },
        { phone: { $regex: query.search, $options: 'i' } },
      ];
    const sort: any = query?.sortBy
        ? { [query.sortBy]: query.sortOrder === 'desc' ? -1 : 1 }
        : { createdAt: -1 };

    return this.fournisseurModel
        .find(filter)
        .sort(sort)
        .populate('products', 'name unit purchasePrice tva stockQuantity stockThreshold')
        .exec();
  }

  // ── Récupérer un fournisseur par ID (produits populés) ───────────────────
  async findOne(id: string, companyId: string): Promise<FournisseurDocument> {
    if (!companyId) throw new BadRequestException('companyId manquant dans le token JWT');

    const f = await this.fournisseurModel
        .findOne({ _id: new Types.ObjectId(id), companyId: new Types.ObjectId(companyId) })
        .populate('products', 'name unit purchasePrice tva stockQuantity stockThreshold');
    if (!f) throw new NotFoundException('Fournisseur introuvable');
    return f;
  }

  // ── Modifier un fournisseur ───────────────────────────────────────────────
  async update(id: string, companyId: string, dto: any, userId: string, userName: string): Promise<FournisseurDocument> {
    const f = await this.fournisseurModel
        .findOneAndUpdate(
            { _id: new Types.ObjectId(id), companyId: new Types.ObjectId(companyId) },
            { ...dto, updatedBy: new Types.ObjectId(userId), updatedByName: userName },
            { new: true },
        )
        .populate('products', 'name unit purchasePrice tva stockQuantity stockThreshold');
    if (!f) throw new NotFoundException('Fournisseur introuvable');
    return f;
  }

  // ── Supprimer un fournisseur ──────────────────────────────────────────────
  async remove(id: string, companyId: string): Promise<void> {
    const f = await this.fournisseurModel.findOneAndDelete({
      _id: new Types.ObjectId(id),
      companyId: new Types.ObjectId(companyId),
    });
    if (!f) throw new NotFoundException('Fournisseur introuvable');
  }

  // ── Mettre à jour la dette ────────────────────────────────────────────────
  async updateDebt(id: string, amount: number, companyId: string): Promise<void> {
    await this.fournisseurModel.findOneAndUpdate(
        { _id: new Types.ObjectId(id), companyId: new Types.ObjectId(companyId) },
        { $inc: { totalDebt: amount } },
    );
  }

  // ── Retourner les achats d'un fournisseur pour cette company ─────────────
  // GET /fournisseurs/userId/:userId/fournisseurId/:fournisseurId/purchases
  async getPurchases(
      fournisseurId: string,
      companyId: string,
      query?: { startDate?: string; endDate?: string; status?: string },
  ) {
    if (!companyId) throw new BadRequestException('companyId manquant dans le token JWT');
    if (!Types.ObjectId.isValid(fournisseurId))
      throw new BadRequestException('fournisseurId invalide');

    // Vérifier que le fournisseur appartient à cette company
    const fournisseur = await this.fournisseurModel.findOne({
      _id: new Types.ObjectId(fournisseurId),
      companyId: new Types.ObjectId(companyId),
    });
    if (!fournisseur) throw new NotFoundException('Fournisseur introuvable');

    // Construire le filtre achats
    const filter: any = {
      FournisseurId: new Types.ObjectId(fournisseurId),
      companyId: new Types.ObjectId(companyId),
    };

    if (query?.status) filter.status = query.status;

    if (query?.startDate || query?.endDate) {
      filter.createdAt = {};
      if (query.startDate) filter.createdAt.$gte = new Date(query.startDate);
      if (query.endDate) {
        const end = new Date(query.endDate);
        end.setHours(23, 59, 59, 999); // inclure toute la journée de fin
        filter.createdAt.$lte = end;
      }
    }

    const purchases = await this.purchaseModel
        .find(filter)
        .sort({ createdAt: -1 })
        .exec();

    // Calculer les statistiques
    const totalDebt  = purchases.reduce((s, p) => s + (p.amountRemaining || 0), 0);
    const totalPaid  = purchases.reduce((s, p) => s + (p.amountPaid || 0), 0);
    const totalSpent = purchases.reduce((s, p) => s + (p.totalTTC || 0), 0);

    return {
      fournisseur: {
        _id:     fournisseur._id,
        name:    fournisseur.name,
        phone:   fournisseur.phone,
        email:   fournisseur.email,
        address: fournisseur.address,
      },
      purchases,
      stats: {
        totalDebt,
        totalPaid,
        totalSpent,
        count: purchases.length,
      },
    };
  }

  // ── Associer un produit existant à un fournisseur ────────────────────────
  async addProduct(fournisseurId: string, productId: string, companyId: string): Promise<FournisseurDocument> {
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

  // ── Retirer un produit d'un fournisseur ──────────────────────────────────
  async removeProduct(fournisseurId: string, productId: string, companyId: string): Promise<FournisseurDocument> {
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
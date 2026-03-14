import {
  Injectable,
  NotFoundException,
  BadRequestException,
  forwardRef,
  Inject,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Product, ProductDocument } from './product.schema';
import { FournisseursService } from '../fournisseurs/fournisseurs.service';

@Injectable()
export class ProductsService {
  constructor(
      @InjectModel(Product.name)
      private productModel: Model<ProductDocument>,
      @Inject(forwardRef(() => FournisseursService))
      private fournisseursService: FournisseursService,
  ) {}

  // ── Créer un produit ──────────────────────────────────────────────────────
  // Si `dto.supplierIds` est fourni → lie automatiquement le produit
  // à chaque fournisseur via fournisseurModel.$addToSet
  async create(dto: any, userId: string, userName: string, companyId: string): Promise<ProductDocument> {
    if (!companyId) throw new BadRequestException('companyId manquant dans le token JWT');

    const { supplierIds, ...rest } = dto;

    const p = new this.productModel({
      ...rest,
      companyId: new Types.ObjectId(companyId),
      createdBy: new Types.ObjectId(userId),
      createdByName: userName,
    });
    const saved = await p.save();

    // Lier le produit à chaque fournisseur fourni
    if (supplierIds && Array.isArray(supplierIds) && supplierIds.length > 0) {
      for (const supplierId of supplierIds) {
        try {
          await this.fournisseursService.addProduct(
              String(supplierId),
              String(saved._id),
              companyId,
          );
        } catch (e) {
          // Ne pas bloquer la création si le lien fournisseur échoue
          console.warn(
              `[ProductsService] Impossible de lier produit ${saved._id} → fournisseur ${supplierId}: ${e.message}`,
          );
        }
      }
    }

    return saved;
  }

  // ── Lister les produits de la company ─────────────────────────────────────
  async findAll(companyId: string, query?: any): Promise<ProductDocument[]> {
    if (!companyId) throw new BadRequestException('companyId manquant dans le token JWT');

    const filter: any = { companyId: new Types.ObjectId(companyId) };
    if (query?.search)
      filter.$or = [{ name: { $regex: query.search, $options: 'i' } }];
    if (query?.lowStock === 'true')
      filter.$expr = { $lte: ['$stockQuantity', '$stockThreshold'] };

    const sort: any = query?.sortBy
        ? { [query.sortBy]: query.sortOrder === 'desc' ? -1 : 1 }
        : { name: 1 };

    return this.productModel.find(filter).sort(sort).exec();
  }

  // ── Récupérer un produit par ID ───────────────────────────────────────────
  async findOne(id: string, companyId: string): Promise<ProductDocument> {
    if (!companyId) throw new BadRequestException('companyId manquant dans le token JWT');

    const p = await this.productModel.findOne({
      _id: new Types.ObjectId(id),
      companyId: new Types.ObjectId(companyId),
    });
    if (!p) throw new NotFoundException('Produit introuvable');
    return p;
  }

  // ── Modifier un produit ───────────────────────────────────────────────────
  async update(id: string, companyId: string, dto: any, userId: string, userName: string): Promise<ProductDocument> {
    console.log(dto)

    for (const supplierId of dto['supplierIds'] || []) {  // ✅ for...of, not for...in
      await this.fournisseursService.addProduct(
          String(supplierId),
          String(id),
          companyId,
      );
    }

    const p = await this.productModel.findOneAndUpdate(
        { _id: new Types.ObjectId(id), companyId: new Types.ObjectId(companyId) },
        { ...dto, updatedBy: new Types.ObjectId(userId), updatedByName: userName },
        { new: true },
    );

    if (!p) throw new NotFoundException('Produit introuvable');
    return p;
  }
  // ── Supprimer un produit ──────────────────────────────────────────────────
  async remove(id: string, companyId: string): Promise<void> {
    const p = await this.productModel.findOneAndDelete({
      _id: new Types.ObjectId(id),
      companyId: new Types.ObjectId(companyId),
    });
    if (!p) throw new NotFoundException('Produit introuvable');
  }

  // ── Ajuster le stock ──────────────────────────────────────────────────────
  async updateStock(id: string, quantity: number, operation: 'add' | 'subtract', companyId: string): Promise<void> {
    const inc = operation === 'add' ? quantity : -quantity;
    await this.productModel.findOneAndUpdate(
        { _id: new Types.ObjectId(id), companyId: new Types.ObjectId(companyId) },
        { $inc: { stockQuantity: inc } },
    );
  }
}
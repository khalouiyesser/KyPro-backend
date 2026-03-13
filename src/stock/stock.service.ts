import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { StockMovement, StockMovementDocument, MovementType, MovementSource } from './stock-movement.schema';

@Injectable()
export class StockService {
  constructor(
      @InjectModel(StockMovement.name) private movementModel: Model<StockMovementDocument>,
      @InjectModel('Product') private productModel: Model<any>,
  ) {}

  /* ── Enregistrement interne (utilisé par PurchasesService / SalesService) ── */
  async recordMovement(dto: {
    productId:   string;
    productName: string;
    type:        MovementType;
    source:      MovementSource;
    quantity:    number;
    stockBefore: number;
    stockAfter:  number;
    referenceId?: string;
    notes?:       string;
    userId:       string;
    companyId:    string;
  }): Promise<StockMovementDocument> {
    const m = new this.movementModel({
      ...dto,
      productId: new Types.ObjectId(dto.productId),
      userId:    dto.userId !== 'system' ? new Types.ObjectId(dto.userId) : undefined,
      companyId: new Types.ObjectId(dto.companyId),
    });
    return m.save();
  }

  /* ── Liste des mouvements ─────────────────────────────────────────────── */
  async findAll(
      companyId: string,
      query?: {
        type?:       string;
        productId?:  string;
        startDate?:  string;
        endDate?:    string;
        limit?:      number;
      },
  ): Promise<StockMovementDocument[]> {
    const filter: any = { companyId: new Types.ObjectId(companyId) };

    if (query?.type)      filter.type      = query.type.toUpperCase();
    if (query?.productId) filter.productId = new Types.ObjectId(query.productId);

    if (query?.startDate || query?.endDate) {
      filter.createdAt = {};
      if (query.startDate) filter.createdAt.$gte = new Date(query.startDate);
      if (query.endDate)   filter.createdAt.$lte = new Date(query.endDate);
    }

    return this.movementModel
        .find(filter)
        .sort({ createdAt: -1 })
        .limit(query?.limit ?? 200)
        .exec();
  }

  /* ── Ajustement manuel ────────────────────────────────────────────────── */
  async manualAdjust(dto: {
    productId: string;
    quantity:  number;
    notes?:    string;
    userId:    string;
    companyId: string;
  }): Promise<StockMovementDocument> {
    if (dto.quantity === 0) throw new BadRequestException('La quantité ne peut pas être zéro');

    const product = await this.productModel.findOne({
      _id:       new Types.ObjectId(dto.productId),
      companyId: new Types.ObjectId(dto.companyId),
    });
    if (!product) throw new NotFoundException('Produit introuvable');

    const stockBefore = product.stockQuantity ?? 0;
    const stockAfter  = stockBefore + dto.quantity;

    if (stockAfter < 0) throw new BadRequestException('Stock insuffisant');

    product.stockQuantity = stockAfter;
    await product.save();

    return this.recordMovement({
      productId:   dto.productId,
      productName: product.name,
      type:        dto.quantity > 0 ? MovementType.IN : MovementType.OUT,
      source:      MovementSource.ADJUSTMENT,
      quantity:    dto.quantity,
      stockBefore,
      stockAfter,
      notes:       dto.notes,
      userId:      dto.userId,
      companyId:   dto.companyId,
    });
  }

  /* ── Mise à jour du seuil d'alerte ───────────────────────────────────── */
  async updateThreshold(
      productId: string,
      threshold: number,
      companyId: string,
  ): Promise<any> {
    const product = await this.productModel.findOneAndUpdate(
        { _id: new Types.ObjectId(productId), companyId: new Types.ObjectId(companyId) },
        { stockThreshold: threshold },
        { new: true },
    );
    if (!product) throw new NotFoundException('Produit introuvable');
    return product;
  }
}
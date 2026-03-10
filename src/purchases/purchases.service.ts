import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Purchase, PurchaseDocument, PurchaseStatus } from './purchase.schema';
import { ProductsService } from '../products/products.service';
import { FournisseursService } from '../fournisseurs/fournisseurs.service';
import { StockService } from '../stock/stock.service';
import { PaymentAchatService } from '../payment-achat/payment-achat.service';
import { MovementType, MovementSource } from '../stock/stock-movement.schema';

@Injectable()
export class PurchasesService {
  constructor(
      @InjectModel(Purchase.name)
      private purchaseModel: Model<PurchaseDocument>,

      private productsService: ProductsService,

      @Inject(forwardRef(() => FournisseursService))
      private fournisseursService: FournisseursService,

      @Inject(forwardRef(() => StockService))
      private stockService: StockService,

      @Inject(forwardRef(() => PaymentAchatService))
      private paymentAchatService: PaymentAchatService,
  ) {}

  /* ─── Créer un achat ─────────────────────────────────────────────────── */
  async create(
      dto: any,
      userId: string,
      userName: string,
      companyId: string,
  ): Promise<PurchaseDocument> {
    const fournisseur = await this.fournisseursService.findOne(
        dto.FournisseurId,
        companyId,
    );

    let totalHT = 0, totalTTC = 0;
    const items = dto.items.map((item: any) => {
      const tva     = item.tva || 0;
      const lineHT  = item.quantity * item.unitPrice;
      const lineTTC = lineHT * (1 + tva / 100);
      totalHT  += lineHT;
      totalTTC += lineTTC;
      return {
        productId:   new Types.ObjectId(item.productId),
        productName: item.productName,
        quantity:    item.quantity,
        unitPrice:   item.unitPrice,
        tva,
        totalHT:     lineHT,
        totalTTC:    lineTTC,
      };
    });

    const initialPayment   = dto.initialPayment || 0;
    const amountRemaining  = totalTTC - initialPayment;

    let status = PurchaseStatus.PENDING;
    if (initialPayment >= totalTTC)  status = PurchaseStatus.PAID;
    else if (initialPayment > 0)     status = PurchaseStatus.PARTIAL;

    const purchase = new this.purchaseModel({
      FournisseurId:   new Types.ObjectId(dto.FournisseurId),
      FournisseurName: fournisseur.name,
      items,
      totalHT,
      totalTTC,
      amountPaid:      initialPayment,
      amountRemaining,
      status,
      notes:         dto.notes,
      paymentMethod: dto.paymentMethod,
      companyId:     new Types.ObjectId(companyId),
      createdBy:     new Types.ObjectId(userId),
      createdByName: userName,
    });

    const saved = await purchase.save();

    // Mettre à jour la dette fournisseur
    await this.fournisseursService.updateDebt(
        dto.FournisseurId,
        amountRemaining,
        companyId,
    );

    // Si paiement initial → enregistrer un PaymentAchat
    if (initialPayment > 0) {
      await this.paymentAchatService.createFromAchat(
          userId,
          dto.FournisseurId,
          initialPayment,
          saved._id.toString(),
          companyId,
          dto.notes || 'Paiement initial',
      );
    }

    // Mise à jour du stock
    for (const item of dto.items) {
      const product    = await this.productsService.findOne(item.productId, companyId).catch(() => null);
      const stockBefore = product?.stockQuantity ?? 0;
      await this.productsService.updateStock(item.productId, item.quantity, 'add', companyId);
      await this.stockService.recordMovement({
        productId:   item.productId,
        productName: item.productName,
        type:        MovementType.IN,
        source:      MovementSource.PURCHASE,
        quantity:    item.quantity,
        stockBefore,
        stockAfter:  stockBefore + item.quantity,
        referenceId: saved._id.toString(),
        notes:       `Achat #${saved._id}`,
        userId,
        companyId,
      });
    }

    return saved;
  }

  /* ─── Lister les achats ──────────────────────────────────────────────── */
  async findAll(
      companyId: string,
      query?: any,
  ): Promise<PurchaseDocument[]> {
    const filter: any = { companyId: new Types.ObjectId(companyId) };
    if (query?.search) filter.FournisseurName = { $regex: query.search, $options: 'i' };
    if (query?.status) filter.status = query.status;
    const sort: any = query?.sortBy
        ? { [query.sortBy]: query.sortOrder === 'desc' ? -1 : 1 }
        : { createdAt: -1 };
    return this.purchaseModel.find(filter).sort(sort).exec();
  }

  /* ─── Récupérer un achat ─────────────────────────────────────────────── */
  async findOne(id: string, companyId: string): Promise<PurchaseDocument> {
    const p = await this.purchaseModel.findOne({
      _id:       new Types.ObjectId(id),
      companyId: new Types.ObjectId(companyId),
    });
    if (!p) throw new NotFoundException('Achat introuvable');
    return p;
  }

  /* ─── Ajouter un paiement ────────────────────────────────────────────── */
  async addPayment(
      id: string,
      companyId: string,
      amount: number,
      note: string,
      userId: string,
  ): Promise<PurchaseDocument> {
    const purchase = await this.findOne(id, companyId);

    if (amount > purchase.amountRemaining + 0.001) {
      throw new BadRequestException('Le montant dépasse le reste à payer');
    }

    purchase.amountPaid      += amount;
    purchase.amountRemaining  = Math.max(0, purchase.amountRemaining - amount);

    if (purchase.amountRemaining <= 0) purchase.status = PurchaseStatus.PAID;
    else if (purchase.amountPaid > 0)  purchase.status = PurchaseStatus.PARTIAL;

    // Réduire la dette fournisseur
    await this.fournisseursService.updateDebt(
        purchase.FournisseurId.toString(),
        -amount,
        companyId,
    );

    // Enregistrer dans la collection PaymentAchat
    await this.paymentAchatService.createFromAchat(
        userId,
        purchase.FournisseurId.toString(),
        amount,
        id,
        companyId,
        note,
    );

    return purchase.save();
  }

  /* ─── Supprimer un achat ─────────────────────────────────────────────── */
  async remove(id: string, companyId: string): Promise<void> {
    const purchase = await this.purchaseModel.findOne({
      _id:       new Types.ObjectId(id),
      companyId: new Types.ObjectId(companyId),
    });
    if (!purchase) throw new NotFoundException('Achat introuvable');

    for (const item of purchase.items) {
      await this.productsService.updateStock(
          item.productId.toString(),
          item.quantity,
          'subtract',
          companyId,
      );
    }

    await this.purchaseModel.findByIdAndDelete(id);
  }

  /* ─── Export ─────────────────────────────────────────────────────────── */
  async findForExport(
      companyId: string,
      startDate?: string,
      endDate?: string,
  ) {
    const filter: any = { companyId: new Types.ObjectId(companyId) };
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate)   filter.createdAt.$lte = new Date(endDate);
    }
    return this.purchaseModel.find(filter).sort({ createdAt: -1 }).exec();
  }
}
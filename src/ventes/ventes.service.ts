// import { BadRequestException, forwardRef, Inject, Injectable, NotFoundException } from '@nestjs/common';
// import { InjectModel } from '@nestjs/mongoose';
// import { Model, Types } from 'mongoose';
// import { Vente, VenteDocument, Ventestatus } from './vente.schema';
// import { ProductsService } from '../products/products.service';
// import { ClientsService } from '../clients/clients.service';
// import { PaymentVenteService } from '../payment-vente/payment-vente.service';
// import { NotificationsService } from '../notifications/notifications.service';
// import { StockService } from '../stock/stock.service';
// import { MovementType, MovementSource } from '../stock/stock-movement.schema';
// import { NotificationType } from '../notifications/notification.schema';
//
// @Injectable()
// export class VentesService {
//   constructor(
//     @InjectModel(Vente.name) private saleModel: Model<VenteDocument>,
//     private productsService: ProductsService,
//     @Inject(forwardRef(() => ClientsService)) private clientsService: ClientsService,
//     @Inject(forwardRef(() => PaymentVenteService)) private paymentVenteService: PaymentVenteService,
//     @Inject(forwardRef(() => NotificationsService)) private notificationsService: NotificationsService,
//     @Inject(forwardRef(() => StockService)) private stockService: StockService,
//   ) {}
//
//   async create(dto: any, userId: string, userName: string, companyId: string): Promise<VenteDocument> {
//     const client = await this.clientsService.findOne(dto.clientId, companyId);
//
//     for (const item of dto.items) {
//       const product = await this.productsService.findOne(item.productId, companyId);
//       if (product.stockQuantity < item.quantity) {
//         throw new BadRequestException(`Stock insuffisant pour "${product.name}". Disponible: ${product.stockQuantity}, demandé: ${item.quantity}`);
//       }
//     }
//
//     let totalHT = 0, totalTTC = 0;
//     const items = dto.items.map((item: any) => {
//       const tva = item.tva ?? 0;
//       const lineHT = item.quantity * item.unitPrice;
//       const lineTTC = lineHT * (1 + tva / 100);
//       totalHT += lineHT; totalTTC += lineTTC;
//       return { productId: new Types.ObjectId(item.productId), productName: item.productName, quantity: item.quantity, unitPrice: item.unitPrice, tva, totalHT: lineHT, totalTTC: lineTTC };
//     });
//
//     const initialPayment = dto.initialPayment || 0;
//     const amountRemaining = totalTTC - initialPayment;
//     let status = Ventestatus.PENDING;
//     if (initialPayment >= totalTTC) status = Ventestatus.PAID;
//     else if (initialPayment > 0) status = Ventestatus.PARTIAL;
//
//     const sale = new this.saleModel({
//       clientId: new Types.ObjectId(dto.clientId),
//       clientName: client.name,
//       items, totalHT, totalTTC,
//       amountPaid: initialPayment,
//       amountRemaining,
//       payments: initialPayment > 0 ? [{ amount: initialPayment, date: new Date(), note: 'Paiement initial' }] : [],
//       status,
//       notes: dto.notes,
//       paymentMethod: dto.paymentMethod,
//       companyId: new Types.ObjectId(companyId),
//       createdBy: new Types.ObjectId(userId),
//       createdByName: userName,
//     });
//
//     const saved = await sale.save();
//
//     if (initialPayment > 0) {
//       await this.paymentVenteService.createFromVente(userId, dto.clientId, initialPayment, saved._id.toString(), 'Paiement initial', companyId);
//     }
//
//     for (const item of dto.items) {
//       const product = await this.productsService.findOne(item.productId, companyId);
//       const stockBefore = product.stockQuantity;
//       const stockAfter = stockBefore - item.quantity;
//       await this.productsService.updateStock(item.productId, item.quantity, 'subtract', companyId);
//       await this.stockService.recordMovement({
//         productId: item.productId,
//         productName: item.productName,
//         type: MovementType.OUT,
//         source: MovementSource.SALE,
//         quantity: item.quantity,
//         stockBefore,
//         stockAfter,
//         referenceId: saved._id.toString(),
//         notes: `Vente #${saved._id}`,
//         userId,
//         companyId,
//       });
//       if (stockAfter <= 0) {
//         await this.notificationsService.create({ title: '🚨 Rupture de stock', message: `"${item.productName}" est en rupture (stock = ${stockAfter}).`, type: NotificationType.LOW_STOCK, link: '/products', companyId });
//       } else if (product.stockThreshold > 0 && stockAfter <= product.stockThreshold) {
//         await this.notificationsService.create({ title: '⚠️ Stock faible', message: `"${item.productName}" proche du seuil (${stockAfter}/${product.stockThreshold}).`, type: NotificationType.LOW_STOCK, link: '/products', companyId });
//       }
//     }
//     return saved;
//   }
//
//   async findAll(companyId: string, query?: any): Promise<VenteDocument[]> {
//     const filter: any = { companyId: new Types.ObjectId(companyId) };
//     if (query?.search) filter.$or = [{ clientName: { $regex: query.search, $options: 'i' } }, { createdByName: { $regex: query.search, $options: 'i' } }];
//     if (query?.status) filter.status = query.status;
//     if (query?.startDate || query?.endDate) {
//       filter.createdAt = {};
//       if (query.startDate) filter.createdAt.$gte = new Date(query.startDate);
//       if (query.endDate) { const e = new Date(query.endDate); e.setHours(23,59,59,999); filter.createdAt.$lte = e; }
//     }
//     const sort: any = query?.sortBy ? { [query.sortBy]: query.sortOrder === 'desc' ? -1 : 1 } : { createdAt: -1 };
//     return this.saleModel.find(filter).sort(sort).exec();
//   }
//
//   async findOne(id: string, companyId: string): Promise<VenteDocument> {
//     const sale = await this.saleModel.findOne({ _id: new Types.ObjectId(id), companyId: new Types.ObjectId(companyId) });
//     if (!sale) throw new NotFoundException('Vente introuvable');
//     return sale;
//   }
//
//   async findByClient(clientId: string, companyId: string, limit = 100): Promise<VenteDocument[]> {
//     return this.saleModel.find({ clientId: new Types.ObjectId(clientId), companyId: new Types.ObjectId(companyId) }).sort({ createdAt: -1 }).limit(limit).exec();
//   }
//
//   async addPayment(id: string, companyId: string, dto: any, userId: string, userName: string): Promise<VenteDocument> {
//     const sale = await this.findOne(id, companyId);
//     if (dto.amount > sale.amountRemaining + 0.001) throw new BadRequestException(`Le montant dépasse le reste à payer (${sale.amountRemaining})`);
//     const newPaid = sale.amountPaid + dto.amount;
//     const newRemaining = Math.max(0, sale.totalTTC - newPaid);
//     const status: Ventestatus = newRemaining <= 0 ? Ventestatus.PAID : newPaid > 0 ? Ventestatus.PARTIAL : Ventestatus.PENDING;
//     const updated = await this.saleModel.findByIdAndUpdate(id,
//       {
//         $push: { payments: { amount: dto.amount, date: new Date(), note: dto.note || '', method: dto.method || 'cash' } },
//         $set: { amountPaid: newPaid, amountRemaining: newRemaining, status, updatedByName: userName },
//       },
//       { new: true });
//     await this.paymentVenteService.createFromVente(userId, sale.clientId.toString(), dto.amount, id, dto.note, companyId);
//     return updated;
//   }
//
//   async remove(id: string, companyId: string): Promise<void> {
//     const sale = await this.saleModel.findOne({ _id: new Types.ObjectId(id), companyId: new Types.ObjectId(companyId) });
//     if (!sale) throw new NotFoundException('Vente introuvable');
//     for (const item of sale.items) {
//       const product = await this.productsService.findOne(item.productId.toString(), companyId).catch(() => null);
//       const stockBefore = product?.stockQuantity ?? 0;
//       await this.productsService.updateStock(item.productId.toString(), item.quantity, 'add', companyId);
//       if (product) {
//         await this.stockService.recordMovement({
//           productId: item.productId.toString(),
//           productName: item.productName,
//           type: MovementType.IN,
//           source: MovementSource.RETURN,
//           quantity: item.quantity,
//           stockBefore,
//           stockAfter: stockBefore + item.quantity,
//           referenceId: id,
//           notes: `Annulation vente #${id}`,
//           userId: 'system',
//           companyId,
//         });
//       }
//     }
//     await this.saleModel.findByIdAndDelete(id);
//   }
//
//   async getStatsByClient(clientId: string, companyId: string) {
//     return this.saleModel.aggregate([
//       { $match: { clientId: new Types.ObjectId(clientId), companyId: new Types.ObjectId(companyId) } },
//       { $group: { _id: null, totalRevenue: { $sum: '$totalTTC' }, totalPaid: { $sum: '$amountPaid' }, count: { $sum: 1 } } },
//     ]);
//   }
//
//   async findForExport(companyId: string, startDate?: string, endDate?: string): Promise<VenteDocument[]> {
//     const filter: any = { companyId: new Types.ObjectId(companyId) };
//     if (startDate || endDate) { filter.createdAt = {}; if (startDate) filter.createdAt.$gte = new Date(startDate); if (endDate) { const e = new Date(endDate); e.setHours(23,59,59,999); filter.createdAt.$lte = e; } }
//     return this.saleModel.find(filter).sort({ createdAt: -1 }).exec();
//   }
//
//   async findByClientForExport(clientId: string, companyId: string, startDate?: string, endDate?: string): Promise<VenteDocument[]> {
//     const filter: any = { clientId: new Types.ObjectId(clientId), companyId: new Types.ObjectId(companyId) };
//     if (startDate || endDate) { filter.createdAt = {}; if (startDate) filter.createdAt.$gte = new Date(startDate); if (endDate) { const e = new Date(endDate); e.setHours(23,59,59,999); filter.createdAt.$lte = e; } }
//     return this.saleModel.find(filter).sort({ createdAt: -1 }).exec();
//   }
//
//
//   async findByCompanyId(clientId: string, companyId: string) {
//         return this.paymentVenteService.findByClient(clientId, companyId);
//   }
//
//
//   // payment-vente.service.ts
//   // ventes.service.ts
//   async aggregateRevenueByClients(
//       clientIds: Types.ObjectId[],
//       companyId: string,
//   ): Promise<Map<string, { totalRevenue: number; count: number }>> {
//     const rows = await this.saleModel.aggregate([
//       { $match: { clientId: { $in: clientIds }, companyId: new Types.ObjectId(companyId) } },
//       { $group: { _id: '$clientId', totalRevenue: { $sum: '$totalTTC' }, count: { $sum: 1 } } },
//     ]);
//     const map = new Map<string, any>();
//     for (const row of rows) {
//       map.set(row._id.toString(), { totalRevenue: row.totalRevenue, count: row.count });
//     }
//     return map;
//   }
//
// }


import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Vente, VenteDocument, Ventestatus } from './vente.schema';
import { ProductsService }     from '../products/products.service';
import { ClientsService }      from '../clients/clients.service';
import { PaymentVenteService } from '../payment-vente/payment-vente.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StockService }         from '../stock/stock.service';
import { MovementType, MovementSource } from '../stock/stock-movement.schema';
import { NotificationType }     from '../notifications/notification.schema';

@Injectable()
export class VentesService {
  constructor(
      @InjectModel(Vente.name) private saleModel: Model<VenteDocument>,
      private productsService: ProductsService,
      @Inject(forwardRef(() => ClientsService))      private clientsService: ClientsService,
      @Inject(forwardRef(() => PaymentVenteService)) private paymentVenteService: PaymentVenteService,
      @Inject(forwardRef(() => NotificationsService)) private notificationsService: NotificationsService,
      @Inject(forwardRef(() => StockService))        private stockService: StockService,
  ) {}

  // ── Créer une vente ────────────────────────────────────────────────────────
  async create(
      dto:       any,
      userId:    string,
      userName:  string,
      companyId: string,
  ): Promise<VenteDocument> {
    const client = await this.clientsService.findOne(dto.clientId, companyId);

    // Vérification des stocks
    for (const item of dto.items) {
      const product = await this.productsService.findOne(item.productId, companyId);
      if (product.stockQuantity < item.quantity) {
        throw new BadRequestException(
            `Stock insuffisant pour "${product.name}". Disponible: ${product.stockQuantity}, demandé: ${item.quantity}`,
        );
      }
    }

    // Calcul des totaux
    let totalHT = 0, totalTTC = 0;
    const items = dto.items.map((item: any) => {
      const tva    = item.tva ?? 0;
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

    // Statut initial
    const initialPayment = dto.initialPayment || 0;
    const amountRemaining = totalTTC - initialPayment;
    let status = Ventestatus.PENDING;
    if (initialPayment >= totalTTC)  status = Ventestatus.PAID;
    else if (initialPayment > 0)     status = Ventestatus.PARTIAL;

    const sale = new this.saleModel({
      clientId:      new Types.ObjectId(dto.clientId),
      clientName:    client.name,
      items,
      totalHT,
      totalTTC,
      amountPaid:    initialPayment,
      amountRemaining,
      payments:      initialPayment > 0
          ? [{ amount: initialPayment, date: new Date(), note: 'Paiement initial' }]
          : [],
      status,
      notes:         dto.notes,
      paymentMethod: dto.paymentMethod,
      companyId:     new Types.ObjectId(companyId),
      createdBy:     new Types.ObjectId(userId),
      createdByName: userName,
    });

    const saved = await sale.save();

    // Enregistrement du paiement initial
    if (initialPayment > 0) {
      await this.paymentVenteService.createFromVente(
          userId, dto.clientId, initialPayment,
          saved._id.toString(), 'Paiement initial', companyId,
      );
    }

    // Mise à jour du stock + mouvements + notifications
    for (const item of dto.items) {
      const product    = await this.productsService.findOne(item.productId, companyId);
      const stockBefore = product.stockQuantity;
      const stockAfter  = stockBefore - item.quantity;

      await this.productsService.updateStock(item.productId, item.quantity, 'subtract', companyId);
      await this.stockService.recordMovement({
        productId:   item.productId,
        productName: item.productName,
        type:        MovementType.OUT,
        source:      MovementSource.SALE,
        quantity:    item.quantity,
        stockBefore,
        stockAfter,
        referenceId: saved._id.toString(),
        notes:       `Vente #${saved._id}`,
        userId,
        companyId,
      });

      if (stockAfter <= 0) {
        await this.notificationsService.create({
          title:     '🚨 Rupture de stock',
          message:   `"${item.productName}" est en rupture (stock = ${stockAfter}).`,
          type:      NotificationType.LOW_STOCK,
          link:      '/products',
          companyId,
        });
      } else if (product.stockThreshold > 0 && stockAfter <= product.stockThreshold) {
        await this.notificationsService.create({
          title:     '⚠️ Stock faible',
          message:   `"${item.productName}" proche du seuil (${stockAfter}/${product.stockThreshold}).`,
          type:      NotificationType.LOW_STOCK,
          link:      '/products',
          companyId,
        });
      }
    }
    return saved;
  }

  // ── Lister les ventes ──────────────────────────────────────────────────────
  async findAll(companyId: string, query?: any): Promise<VenteDocument[]> {
    const filter: any = { companyId: new Types.ObjectId(companyId) };

    if (query?.search) {
      filter.$or = [
        { clientName:    { $regex: query.search, $options: 'i' } },
        { createdByName: { $regex: query.search, $options: 'i' } },
      ];
    }
    if (query?.status) filter.status = query.status;
    if (query?.startDate || query?.endDate) {
      filter.createdAt = {};
      if (query.startDate) filter.createdAt.$gte = new Date(query.startDate);
      if (query.endDate) {
        const e = new Date(query.endDate);
        e.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = e;
      }
    }

    const sort: any = query?.sortBy
        ? { [query.sortBy]: query.sortOrder === 'desc' ? -1 : 1 }
        : { createdAt: -1 };

    return this.saleModel.find(filter).sort(sort).exec();
  }

  // ── Trouver une vente ──────────────────────────────────────────────────────
  async findOne(id: string, companyId: string): Promise<VenteDocument> {
    const sale = await this.saleModel.findOne({
      _id:       new Types.ObjectId(id),
      companyId: new Types.ObjectId(companyId),
    });
    if (!sale) throw new NotFoundException('Vente introuvable');
    return sale;
  }

  async findByClient(clientId: string, companyId: string, limit = 100): Promise<VenteDocument[]> {
    return this.saleModel
        .find({ clientId: new Types.ObjectId(clientId), companyId: new Types.ObjectId(companyId) })
        .sort({ createdAt: -1 })
        .limit(limit)
        .exec();
  }

  // ── Ajouter un paiement ────────────────────────────────────────────────────
  async addPayment(
      id:        string,
      companyId: string,
      dto:       any,
      userId:    string,
      userName:  string,
  ): Promise<VenteDocument> {
    const sale = await this.findOne(id, companyId);

    if (dto.amount > sale.amountRemaining + 0.001) {
      throw new BadRequestException(
          `Le montant dépasse le reste à payer (${sale.amountRemaining})`,
      );
    }

    const newPaid      = sale.amountPaid + dto.amount;
    const newRemaining = Math.max(0, sale.totalTTC - newPaid);
    const status: Ventestatus =
        newRemaining <= 0 ? Ventestatus.PAID
            : newPaid > 0    ? Ventestatus.PARTIAL
                :                  Ventestatus.PENDING;

    const updated = await this.saleModel.findByIdAndUpdate(
        id,
        {
          $push: {
            payments: {
              amount: dto.amount,
              date:   new Date(),
              note:   dto.note   || '',
              method: dto.method || 'cash',
            },
          },
          $set: {
            amountPaid:      newPaid,
            amountRemaining: newRemaining,
            status,
            updatedByName:   userName,   // ✅ présent dans le schema
          },
        },
        { new: true },
    );

    await this.paymentVenteService.createFromVente(
        userId, sale.clientId.toString(), dto.amount, id, dto.note, companyId,
    );
    return updated;
  }

  // ── Supprimer une vente (retour stock) ────────────────────────────────────
  async remove(id: string, companyId: string): Promise<void> {
    const sale = await this.saleModel.findOne({
      _id:       new Types.ObjectId(id),
      companyId: new Types.ObjectId(companyId),
    });
    if (!sale) throw new NotFoundException('Vente introuvable');

    for (const item of sale.items) {
      const product    = await this.productsService.findOne(item.productId.toString(), companyId).catch(() => null);
      const stockBefore = product?.stockQuantity ?? 0;

      await this.productsService.updateStock(item.productId.toString(), item.quantity, 'add', companyId);

      if (product) {
        await this.stockService.recordMovement({
          productId:   item.productId.toString(),
          productName: item.productName,
          type:        MovementType.IN,
          source:      MovementSource.RETURN,
          quantity:    item.quantity,
          stockBefore,
          stockAfter:  stockBefore + item.quantity,
          referenceId: id,
          notes:       `Annulation vente #${id}`,
          userId:      'system',
          companyId,
        });
      }
    }
    await this.saleModel.findByIdAndDelete(id);
  }

  // ── Statistiques par client ───────────────────────────────────────────────
  async getStatsByClient(clientId: string, companyId: string) {
    return this.saleModel.aggregate([
      {
        $match: {
          clientId:  new Types.ObjectId(clientId),
          companyId: new Types.ObjectId(companyId),
        },
      },
      {
        $group: {
          _id:          null,
          totalRevenue: { $sum: '$totalTTC' },
          totalPaid:    { $sum: '$amountPaid' },
          count:        { $sum: 1 },
        },
      },
    ]);
  }

  // ── Export ────────────────────────────────────────────────────────────────
  async findForExport(
      companyId:  string,
      startDate?: string,
      endDate?:   string,
  ): Promise<VenteDocument[]> {
    const filter: any = { companyId: new Types.ObjectId(companyId) };
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const e = new Date(endDate);
        e.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = e;
      }
    }
    return this.saleModel.find(filter).sort({ createdAt: -1 }).exec();
  }

  async findByClientForExport(
      clientId:   string,
      companyId:  string,
      startDate?: string,
      endDate?:   string,
  ): Promise<VenteDocument[]> {
    const filter: any = {
      clientId:  new Types.ObjectId(clientId),
      companyId: new Types.ObjectId(companyId),
    };
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const e = new Date(endDate);
        e.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = e;
      }
    }
    return this.saleModel.find(filter).sort({ createdAt: -1 }).exec();
  }

  async findByCompanyId(clientId: string, companyId: string) {
    return this.paymentVenteService.findByClient(clientId, companyId);
  }

  // ── Agrégation revenus par clients ────────────────────────────────────────
  async aggregateRevenueByClients(
      clientIds: Types.ObjectId[],
      companyId: string,
  ): Promise<Map<string, { totalRevenue: number; count: number }>> {
    const rows = await this.saleModel.aggregate([
      {
        $match: {
          clientId:  { $in: clientIds },
          companyId: new Types.ObjectId(companyId),
        },
      },
      {
        $group: {
          _id:          '$clientId',
          totalRevenue: { $sum: '$totalTTC' },
          count:        { $sum: 1 },
        },
      },
    ]);

    const map = new Map<string, { totalRevenue: number; count: number }>();
    for (const row of rows) {
      map.set(row._id.toString(), { totalRevenue: row.totalRevenue, count: row.count });
    }
    return map;
  }
}
// import {Injectable, NotFoundException} from '@nestjs/common';
// import { InjectModel } from '@nestjs/mongoose';
// import {Model, ObjectId, Types} from 'mongoose';
// import { PaymentVente, PaymentVenteDocument } from './entities/payment-vente.entity';
// import {CreatePaymentVenteDto} from "./dto/create-payment-vente.dto";
//
// @Injectable()
// export class PaymentVenteService {
//   constructor(@InjectModel(PaymentVente.name) private model: Model<PaymentVenteDocument>) {}
//
//   async createFromVente(userId: string, clientId: string, amount: number, venteId: string, note: string, companyId: string): Promise<PaymentVenteDocument> {
//     const p = new this.model({ userId: new Types.ObjectId(userId), clientId: new Types.ObjectId(clientId), amount, venteId: new Types.ObjectId(venteId), note, companyId: new Types.ObjectId(companyId) });
//     return p.save();
//   }
//
//
//   async createFromClient(
//       dto: { userId: string; clientId: string; amount: number; note?: string },
//       companyId: string,
//   ): Promise<PaymentVenteDocument> {
//     console.log(1111111111111111111111111111111)
//     const p = new this.model({
//       userId:    new Types.ObjectId(dto.userId),
//       clientId:  new Types.ObjectId(dto.clientId),
//       amount:    dto.amount,
//       note:      dto.note,
//       companyId: new Types.ObjectId(companyId),
//     });
//     return p.save();
//   }
//
//
//
//   async findAll(companyId: string): Promise<PaymentVenteDocument[]> {
//     return this.model.find({ companyId: new Types.ObjectId(companyId) }).sort({ createdAt: -1 }).exec();
//   }
//
//   async findByClient(clientId: string, companyId: string): Promise<PaymentVenteDocument[]> {
//     return this.model.find({ clientId: new Types.ObjectId(clientId), companyId: new Types.ObjectId(companyId) }).sort({ createdAt: -1 }).exec();
//   }
//
//
//
//   // payment-vente.service.ts
//   async aggregateByClients(
//       clientIds: Types.ObjectId[],
//       companyId: string,
//   ): Promise<Map<string, number>> {
//     const rows = await this.model.aggregate([
//       { $match: { clientId: { $in: clientIds }, companyId: new Types.ObjectId(companyId) } },
//       { $group: { _id: '$clientId', totalPaid: { $sum: '$amount' } } },
//     ]);
//     const map = new Map<string, number>();
//     for (const row of rows) {
//       map.set(row._id.toString(), row.totalPaid);
//     }
//     return map;
//   }
//
//   async update(id: string, companyId: string, dto: { amount?: number; note?: string }): Promise<PaymentVenteDocument> {
//     const p = await this.model.findOneAndUpdate(
//         { _id: new Types.ObjectId(id), companyId: new Types.ObjectId(companyId) },
//         { ...dto },
//         { new: true },
//     );
//     if (!p) throw new NotFoundException('Paiement introuvable');
//     return p;
//   }
//
//   async remove(id: string, companyId: string): Promise<void> {
//     const p = await this.model.findOneAndDelete({
//       _id: new Types.ObjectId(id),
//       companyId: new Types.ObjectId(companyId),
//     });
//     if (!p) throw new NotFoundException('Paiement introuvable');
//   }
//
// }

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';                          // ObjectId retiré (inutilisé)
import { PaymentVente, PaymentVenteDocument } from './entities/payment-vente.entity';

@Injectable()
export class PaymentVenteService {
  constructor(
      @InjectModel(PaymentVente.name) private model: Model<PaymentVenteDocument>,
  ) {}

  // ── Créé depuis une vente (venteId obligatoire) ───────────────────────────
  async createFromVente(
      userId:    string,
      clientId:  string,
      amount:    number,
      venteId:   string,
      note:      string,
      companyId: string,
  ): Promise<PaymentVenteDocument> {
    const p = new this.model({
      userId:    new Types.ObjectId(userId),
      clientId:  new Types.ObjectId(clientId),
      amount,
      venteId:   new Types.ObjectId(venteId),
      note,
      companyId: new Types.ObjectId(companyId),
    });
    return p.save();
  }

  // ── Créé depuis la fiche client (sans venteId) ────────────────────────────
  async createFromClient(
      dto: { userId: string; clientId: string; amount: number; note?: string },
      companyId: string,
  ): Promise<PaymentVenteDocument> {
    const p = new this.model({
      userId:    new Types.ObjectId(dto.userId),
      clientId:  new Types.ObjectId(dto.clientId),
      amount:    dto.amount,
      note:      dto.note,
      companyId: new Types.ObjectId(companyId),
    });
    return p.save();
  }

  async findAll(companyId: string): Promise<PaymentVenteDocument[]> {
    return this.model
        .find({ companyId: new Types.ObjectId(companyId) })
        .sort({ createdAt: -1 })
        .exec();
  }

  async findByClient(clientId: string, companyId: string): Promise<PaymentVenteDocument[]> {
    return this.model
        .find({
          clientId:  new Types.ObjectId(clientId),
          companyId: new Types.ObjectId(companyId),
        })
        .sort({ createdAt: -1 })
        .exec();
  }

  async aggregateByClients(
      clientIds: Types.ObjectId[],
      companyId: string,
  ): Promise<Map<string, number>> {
    const rows = await this.model.aggregate([
      {
        $match: {
          clientId:  { $in: clientIds },
          companyId: new Types.ObjectId(companyId),
        },
      },
      { $group: { _id: '$clientId', totalPaid: { $sum: '$amount' } } },
    ]);

    const map = new Map<string, number>();
    for (const row of rows) {
      map.set(row._id.toString(), row.totalPaid);
    }
    return map;
  }

  async update(
      id:        string,
      companyId: string,
      dto: { amount?: number; note?: string },
  ): Promise<PaymentVenteDocument> {
    const p = await this.model.findOneAndUpdate(
        { _id: new Types.ObjectId(id), companyId: new Types.ObjectId(companyId) },
        { ...dto },
        { new: true },
    );
    if (!p) throw new NotFoundException('Paiement introuvable');
    return p;
  }

  async remove(id: string, companyId: string): Promise<void> {
    const p = await this.model.findOneAndDelete({
      _id:       new Types.ObjectId(id),
      companyId: new Types.ObjectId(companyId),
    });
    if (!p) throw new NotFoundException('Paiement introuvable');
  }
}
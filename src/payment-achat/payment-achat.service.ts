import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PaymentAchat, PaymentAchatDocument } from './entities/payment-achat.entity';

@Injectable()
export class PaymentAchatService {
  constructor(
      @InjectModel(PaymentAchat.name)
      private model: Model<PaymentAchatDocument>,
  ) {}

  async createFromAchat(
      userId: string,
      fournisseurId: string,
      amount: number,
      achatId: string,
      companyId: string,
      note?: string,
  ): Promise<PaymentAchatDocument> {
    const p = new this.model({
      userId:        new Types.ObjectId(userId),
      fournisseurId: new Types.ObjectId(fournisseurId),
      amount,
      note,
      achatId:   new Types.ObjectId(achatId),
      companyId: new Types.ObjectId(companyId),
    });
    return p.save();
  }

  async findAll(companyId: string): Promise<PaymentAchatDocument[]> {
    return this.model
        .find({ companyId: new Types.ObjectId(companyId) })
        .sort({ createdAt: -1 })
        .exec();
  }

  async findByFournisseur(
      fournisseurId: string,
      companyId: string,
  ): Promise<PaymentAchatDocument[]> {
    return this.model
        .find({
          fournisseurId: new Types.ObjectId(fournisseurId),
          companyId:     new Types.ObjectId(companyId),
        })
        .sort({ createdAt: -1 })
        .exec();
  }

  async update(
      id: string,
      companyId: string,
      dto: { amount?: number; note?: string },
  ): Promise<PaymentAchatDocument> {
    const p = await this.model.findOneAndUpdate(
        {
          _id:       new Types.ObjectId(id),
          companyId: new Types.ObjectId(companyId),
        },
        { ...dto },
        { new: true },
    );
    if (!p) throw new NotFoundException('Paiement introuvable');
    return p;
  }

  async remove(id: string, companyId: string): Promise<void> {
    await this.model.findOneAndDelete({
      _id:       new Types.ObjectId(id),
      companyId: new Types.ObjectId(companyId),
    });
  }

  /**
   * Agrégat totalPaid par fournisseur — utilisé dans FournisseursService.findAll()
   * Retourne Map<fournisseurId_string, totalPaid_number>
   */
  async aggregateByFournisseurs(
      fournisseurIds: Types.ObjectId[],
      companyId: string,
  ): Promise<Map<string, number>> {
    const rows = await this.model.aggregate([
      {
        $match: {
          fournisseurId: { $in: fournisseurIds },
          companyId:     new Types.ObjectId(companyId),
        },
      },
      {
        $group: {
          _id:       '$fournisseurId',
          totalPaid: { $sum: '$amount' },
        },
      },
    ]);
    const map = new Map<string, number>();
    for (const row of rows) map.set(row._id.toString(), row.totalPaid);
    return map;
  }
}
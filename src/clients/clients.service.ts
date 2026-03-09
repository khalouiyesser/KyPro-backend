import { Injectable, NotFoundException, ConflictException, forwardRef, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Client, ClientDocument } from './client.schema';
import { VentesService } from '../ventes/ventes.service';
import {PaymentVenteService} from "../payment-vente/payment-vente.service";
import {UsersService} from "../users/users.service";
import {CreatePaymentVenteDto} from "../payment-vente/dto/create-payment-vente.dto";

// clients.service.ts
@Injectable()
export class ClientsService {
  constructor(
      @InjectModel(Client.name) private clientModel: Model<ClientDocument>,
      @Inject(forwardRef(() => VentesService))       private ventesService:       VentesService,
      @Inject(forwardRef(() => PaymentVenteService)) private paymentVenteService: PaymentVenteService, // ← corrigé
      @Inject(forwardRef(() => UsersService))        private userService:         UsersService,        // ← corrigé
  ) {}

  async create(dto: any, userId: string, userName: string, companyId: string): Promise<ClientDocument> {
    const existing = await this.clientModel.findOne({ phone: dto.phone, companyId: new Types.ObjectId(companyId) });
    if (existing) throw new ConflictException('Ce numéro de téléphone est déjà utilisé');
    const client = new this.clientModel({
      ...dto,
      companyId: new Types.ObjectId(companyId),
      createdBy: new Types.ObjectId(userId),
      createdByName: userName,
    });
    return client.save();
  }

  // clients.service.ts

  async findAll(companyId: string, query?: any): Promise<any[]> {
    const filter: any = { companyId: new Types.ObjectId(companyId) };
    if (query?.search) filter.$or = [
      { name: { $regex: query.search, $options: 'i' } },
      { phone: { $regex: query.search, $options: 'i' } },
      { email: { $regex: query.search, $options: 'i' } },
    ];
    if (query?.isActive !== undefined) filter.isActive = query.isActive === 'true';
    const sort: any = query?.sortBy
        ? { [query.sortBy]: query.sortOrder === 'desc' ? -1 : 1 }
        : { createdAt: -1 };

    const clients = await this.clientModel.find(filter).sort(sort).lean().exec();
    if (!clients.length) return [];

    const clientIds = clients.map(c => c._id);

    // ── Ventes : totalRevenue depuis les ventes (source de vérité pour le CA)
    const ventesRows = await this.ventesService.aggregateRevenueByClients(clientIds, companyId);

    // ── Paiements : totalPaid depuis PaymentVente (source de vérité pour encaissements)
    const paymentsRows = await this.paymentVenteService.aggregateByClients(clientIds, companyId);

    return clients.map(client => {
      const id = client._id.toString();
      const totalRevenue = ventesRows.get(id)?.totalRevenue ?? 0;
      const count        = ventesRows.get(id)?.count ?? 0;
      const totalPaid    = paymentsRows.get(id) ?? 0;
      const totalCredit  = totalRevenue - totalPaid;
      return {
        ...client,
        totalRevenue,
        totalPaid,
        totalCredit,
        salesCount:    count,
        paymentStatus: totalCredit <= 0 ? 'paid' : 'partial',
      };
    });
  }
  async findOne(id: string, companyId: string): Promise<ClientDocument> {
    const client = await this.clientModel.findOne({ _id: new Types.ObjectId(id), companyId: new Types.ObjectId(companyId) });
    if (!client) throw new NotFoundException('Client introuvable');
    return client;
  }

  async update(id: string, companyId: string, dto: any, userId: string, userName: string): Promise<ClientDocument> {
    const client = await this.clientModel.findOneAndUpdate(
      { _id: new Types.ObjectId(id), companyId: new Types.ObjectId(companyId) },
      { ...dto, updatedByName: userName },
      { new: true },
    );
    if (!client) throw new NotFoundException('Client introuvable');
    return client;
  }

  async remove(id: string, companyId: string): Promise<void> {
    const client = await this.clientModel.findOneAndDelete({ _id: new Types.ObjectId(id), companyId: new Types.ObjectId(companyId) });
    if (!client) throw new NotFoundException('Client introuvable');
  }

  // async getClientStats(clientId: string, companyId: string) {
  //   const client = await this.findOne(clientId, companyId);
  //   const [stats, recentSales] = await Promise.all([
  //     this.ventesService.getStatsByClient(clientId, companyId),
  //     this.ventesService.findByClient(clientId, companyId, 100),
  //   ]);
  //   const payments = await this.ventesService.findByCompanyId(clientId, companyId);
  //   const agg = stats[0] || { totalRevenue: 0, totalPaid: 0, count: 0 };
  //   return {
  //     client,
  //     creditAvailable: (client.creditLimit || 0) - (client.creditUsed || 0),
  //     totalRevenue: agg.totalRevenue,
  //     totalPaid: agg.totalPaid,
  //     totalCredit: agg.totalRevenue - agg.totalPaid,
  //     count: agg.count,
  //     recentSales,
  //     payments : payments,
  //   };
  // }


  // clients.service.ts
  async getClientStats(clientId: string, companyId: string) {
    const client = await this.findOne(clientId, companyId);

    const [recentSales, payments] = await Promise.all([
      this.ventesService.findByClient(clientId, companyId, 100),
      this.paymentVenteService.findByClient(clientId, companyId), // ← source de vérité
    ]);

    // Calculer depuis les vraies ventes
    const totalRevenue = recentSales.reduce((sum, s) => sum + (s.totalTTC || 0), 0);

    // Calculer depuis les vrais paiements (PaymentVente = tout ce qui a été payé)
    const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const totalCredit = totalRevenue - totalPaid;

    return {
      client,
      creditAvailable: (client.creditLimit || 0) - (client.creditUsed || 0),
      totalRevenue,
      totalPaid,
      totalCredit,
      count: recentSales.length,
      recentSales,
      payments,
    };
  }



  async findByClientForExport(clientId: string, companyId: string, startDate?: string, endDate?: string) {
    return this.ventesService.findByClientForExport(clientId, companyId, startDate, endDate);
  }

  async updateCredit(clientId: string, amount: number, companyId: string): Promise<void> {
    await this.clientModel.findOneAndUpdate(
      { _id: new Types.ObjectId(clientId), companyId: new Types.ObjectId(companyId) },
      { $inc: { creditUsed: amount } },
    );
  }

  async creerPaymentVenteService(
      paymentVente: { userId: string; clientId: string; amount: number; note?: string },
      userId: string,
      companyId: string,   // ← reçu directement du controller
  ) {
    return this.paymentVenteService.createFromClient(paymentVente, companyId);
  }

}

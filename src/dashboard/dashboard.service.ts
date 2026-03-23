import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Vente }        from '../ventes/vente.schema';
import { Purchase }     from '../purchases/purchase.schema';
import { Client }       from '../clients/client.schema';
import { Product }      from '../products/product.schema';
import { Charge }       from '../charges/charge.schema';
import { Notification } from '../notifications/notification.schema';

@Injectable()
export class DashboardService {
  constructor(
      @InjectModel(Vente.name)        private venteModel:    Model<any>,
      @InjectModel(Purchase.name)     private purchaseModel: Model<any>,
      @InjectModel(Client.name)       private clientModel:   Model<any>,
      @InjectModel(Product.name)      private productModel:  Model<any>,
      @InjectModel(Charge.name)       private chargeModel:   Model<any>,
      @InjectModel(Notification.name) private notifModel:    Model<any>,
  ) {}

  async getKpis(companyId: string) {
    const cId          = new Types.ObjectId(companyId);
    const now          = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    // Fenêtre 6 mois pour les graphiques
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);


    const [
      ventesTotal,
      ventesMonth,
      purchasesTotal,
      clientsActive,
      lowStockProducts,
      chargesMonth,
      unreadNotifs,
      recentSales,
      topClients,
      // NOUVEAU : série mensuelle des 6 derniers mois (pour le graphique)
      monthlyVentes,
      monthlyPurchases,
    ] = await Promise.all([
      // ── KPI globaux ────────────────────────────────────────────────────────
      this.venteModel.aggregate([
        { $match: { companyId: cId } },
        { $group: { _id: null, total: { $sum: '$totalTTC' }, paid: { $sum: '$amountPaid' }, remaining: { $sum: '$amountRemaining' } } },
      ]),

      this.venteModel.aggregate([
        { $match: { companyId: cId, createdAt: { $gte: startOfMonth } } },
        { $group: { _id: null, total: { $sum: '$totalTTC' }, count: { $sum: 1 } } },
      ]),

      this.purchaseModel.aggregate([
        { $match: { companyId: cId } },
        { $group: { _id: null, total: { $sum: '$totalTTC' }, debt: { $sum: '$amountRemaining' } } },
      ]),

      this.clientModel.countDocuments({ companyId: cId, isActive: true }),

      this.productModel
          .find({ companyId: cId, $expr: { $lte: ['$stockQuantity', '$stockThreshold'] } })
          .limit(10)
          .lean(),

      this.chargeModel.aggregate([
        { $match: { companyId: cId, date: { $gte: startOfMonth } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),


      this.notifModel.countDocuments({ companyId: cId, isRead: false }),

      this.venteModel.find({ companyId: cId }).sort({ createdAt: -1 }).limit(5).lean(),

      this.venteModel.aggregate([
        { $match: { companyId: cId } },
        { $group: { _id: '$clientId', clientName: { $first: '$clientName' }, total: { $sum: '$totalTTC' } } },
        { $sort: { total: -1 } },
        { $limit: 5 },
      ]),

      // NOUVEAU : CA mensuel sur 6 mois (pour AreaChart / BarChart)
      this.venteModel.aggregate([
        { $match: { companyId: cId, createdAt: { $gte: sixMonthsAgo } } },
        {
          $group: {
            _id:      { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
            revenue:  { $sum: '$totalTTC' },
            paid:     { $sum: '$amountPaid' },
            count:    { $sum: 1 },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]),

      // NOUVEAU : Achats mensuels sur 6 mois
      this.purchaseModel.aggregate([
        { $match: { companyId: cId, createdAt: { $gte: sixMonthsAgo } } },
        {
          $group: {
            _id:   { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
            total: { $sum: '$totalTTC' },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]),
    ]);

    const v  = ventesTotal[0]   || { total: 0, paid: 0, remaining: 0 };
    const vm = ventesMonth[0]   || { total: 0, count: 0 };
    const p  = purchasesTotal[0] || { total: 0, debt: 0 };

    // Fusionner achats dans la série mensuelle ventes pour le graphique
    const purchasesByMonth = new Map(
        monthlyPurchases.map((m: any) => [`${m._id.year}-${m._id.month}`, m.total]),
    );

    const enrichedMonthly = (monthlyVentes as any[]).map((m: any) => ({
      _id:       m._id,
      revenue:   m.revenue,
      paid:      m.paid,
      count:     m.count,
      purchases: purchasesByMonth.get(`${m._id.year}-${m._id.month}`) ?? 0,
    }));

    return {
      revenue:             { total: v.total, paid: v.paid, remaining: v.remaining },
      revenueThisMonth:    { total: vm.total, count: vm.count },
      purchases:           { total: p.total, debt: p.debt },
      clients:             { active: clientsActive },
      lowStockProducts,
      chargesThisMonth:    chargesMonth[0]?.total || 0,
      unreadNotifications: unreadNotifs,
      recentSales,
      topClients,
      // NOUVEAU — alimente les graphiques du frontend
      monthlyVentes:    enrichedMonthly,
    };
  }
}
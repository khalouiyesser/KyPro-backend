import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { Vente, VenteSchema } from '../ventes/vente.schema';
import { Purchase, PurchaseSchema } from '../purchases/purchase.schema';
import { Client, ClientSchema } from '../clients/client.schema';
import { Product, ProductSchema } from '../products/product.schema';
import { Charge, ChargeSchema } from '../charges/charge.schema';
import { Notification, NotificationSchema } from '../notifications/notification.schema';

@Module({
  imports: [MongooseModule.forFeature([
    { name: Vente.name, schema: VenteSchema },
    { name: Purchase.name, schema: PurchaseSchema },
    { name: Client.name, schema: ClientSchema },
    { name: Product.name, schema: ProductSchema },
    { name: Charge.name, schema: ChargeSchema },
    { name: Notification.name, schema: NotificationSchema },
  ])],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}

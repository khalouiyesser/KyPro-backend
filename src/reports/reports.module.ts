import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { Vente, VenteSchema } from '../ventes/vente.schema';
import { Purchase, PurchaseSchema } from '../purchases/purchase.schema';
import { Charge, ChargeSchema } from '../charges/charge.schema';
import { Product, ProductSchema } from '../products/product.schema';
import { ExportModule } from '../export/export.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Vente.name, schema: VenteSchema },
      { name: Purchase.name, schema: PurchaseSchema },
      { name: Charge.name, schema: ChargeSchema },
      { name: Product.name, schema: ProductSchema },
    ]),
    ExportModule,
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}

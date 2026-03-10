import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Purchase, PurchaseSchema } from './purchase.schema';
import { PurchasesController } from './purchases.controller';
import { PurchasesService } from './purchases.service';
import { ProductsModule } from '../products/products.module';
import { FournisseursModule } from '../fournisseurs/fournisseurs.module';
import { StockModule } from '../stock/stock.module';
import { ExportModule } from '../export/export.module';
import { PaymentAchatModule } from '../payment-achat/payment-achat.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Purchase.name, schema: PurchaseSchema }]),
    ProductsModule,
    forwardRef(() => FournisseursModule),
    forwardRef(() => StockModule),
    forwardRef(() => PaymentAchatModule),  // ← ajouté
    ExportModule,
  ],
  controllers: [PurchasesController],
  providers: [PurchasesService],
  exports: [PurchasesService],
})
export class PurchasesModule {}
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Fournisseur, FournisseurSchema } from './fournisseur.schema';
import { FournisseursController } from './fournisseurs.controller';
import { FournisseursService } from './fournisseurs.service';
import { ProductsModule } from '../products/products.module';
import { Purchase, PurchaseSchema } from '../purchases/purchase.schema';
import { ExportModule } from '../export/export.module';
import { PaymentAchatModule } from '../payment-achat/payment-achat.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Fournisseur.name, schema: FournisseurSchema },
      { name: Purchase.name,    schema: PurchaseSchema    },
    ]),
    forwardRef(() => ProductsModule),
    forwardRef(() => ExportModule),
    forwardRef(() => PaymentAchatModule),  // ← remplace PaymentVenteModule
  ],
  controllers: [FournisseursController],
  providers: [FournisseursService],
  exports: [FournisseursService],
})
export class FournisseursModule {}
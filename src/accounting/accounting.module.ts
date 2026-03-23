import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AccountingService } from './accounting.service';
import { AccountingController } from './accounting.controller';
import { Vente, VenteSchema } from '../ventes/vente.schema';
import { Purchase, PurchaseSchema } from '../purchases/purchase.schema';
import { Charge, ChargeSchema } from '../charges/charge.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Vente.name, schema: VenteSchema },
      { name: Purchase.name, schema: PurchaseSchema },
      { name: Charge.name, schema: ChargeSchema },
    ]),
  ],
  controllers: [AccountingController],
  providers: [AccountingService],
  exports: [AccountingService],
})
export class AccountingModule {}

import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Client, ClientSchema } from './client.schema';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';
import { VentesModule } from '../ventes/ventes.module';
import { ExportModule } from '../export/export.module';
import {PaymentVenteService} from "../payment-vente/payment-vente.service";
import {PaymentVenteModule} from "../payment-vente/payment-vente.module";
import {UsersModule} from "../users/users.module";

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Client.name, schema: ClientSchema }]),
    forwardRef(() => VentesModule),
    forwardRef(() => PaymentVenteModule),
    forwardRef(() => UsersModule),
    ExportModule,
  ],
  controllers: [ClientsController],
  providers: [ClientsService],
  exports: [ClientsService],
})
export class ClientsModule {}

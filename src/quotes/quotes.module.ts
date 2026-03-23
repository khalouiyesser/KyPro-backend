import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Quote, QuoteSchema }   from './quote.schema';
import { QuotesController }     from './quotes.controller';
import { QuotesService }        from './quotes.service';
import { ExportModule }         from '../export/export.module';

// Adapte les chemins selon ta structure de projet
import { Vente, VenteSchema }   from '../ventes/vente.schema';
import { Client, ClientSchema } from '../clients/client.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Quote.name,  schema: QuoteSchema  },
      { name: Vente.name,  schema: VenteSchema  }, // pour @InjectModel('Vente')
      { name: Client.name, schema: ClientSchema }, // pour @InjectModel('Client') — création auto client
    ]),
    ExportModule,
  ],
  controllers: [QuotesController],
  providers:   [QuotesService],
  exports:     [QuotesService],
})
export class QuotesModule {}
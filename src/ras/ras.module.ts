import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {RasDebiteur, RasDebiteurSchema} from "./rasDebiteur.schema";
import {RasBeneficiaire, RasBeneficiaireSchema} from "./rasBeneficiaire.schema";
import {RasDebiteurService} from "./rasDebiteur.service";
import {RasBeneficiaireService} from "./rasBeneficiaire.service";
import {RasDebiteurController} from "./RasDebiteur.controller";
import {RasBeneficiaireController} from "./rasBeneficiaire.controller";



@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RasDebiteur.name,    schema: RasDebiteurSchema },
      { name: RasBeneficiaire.name, schema: RasBeneficiaireSchema },
    ]),
  ],
  providers: [
    RasDebiteurService,
    RasBeneficiaireService,
  ],
  controllers: [
    RasDebiteurController,
    RasBeneficiaireController,
  ],
  exports: [
    RasDebiteurService,
    RasBeneficiaireService,
  ],
})
export class RasModule {}
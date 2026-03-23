import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RasDebiteurDocument = RasDebiteur & Document;

@Schema({ timestamps: true })
export class RasDebiteur {
    @Prop({ type: Types.ObjectId, ref: 'Purchase', required: false })
    achatId?: Types.ObjectId;

    @Prop({ type: Types.ObjectId, ref: 'Fournisseur', required: false })
    fournisseurId?: Types.ObjectId;

    @Prop({ required: true })  fournisseurName:      string;
    @Prop({ required: true })  matriculeFournisseur: string;
    @Prop({ required: true })  codeOperation:        string;
    @Prop({ required: true })  montantBrut:          number;
    @Prop({ required: true })  tauxRAS:              number;
    @Prop({ required: true })  montantRAS:           number;
    @Prop({ required: true })  netPaye:              number;
    @Prop({ required: true })  datePaiement:         Date;
    @Prop({ required: true })  exercice:             number;
    @Prop({ required: true })  mois:                 number;
    @Prop({ default: false })  reversee:             boolean;
    @Prop()                    certificatTEJNumero?: string;

    @Prop({ type: Types.ObjectId, ref: 'Company', required: true })
    companyId: Types.ObjectId;

    @Prop({ type: Types.ObjectId, ref: 'User', required: false })
    createdBy?: Types.ObjectId;
}

export const RasDebiteurSchema = SchemaFactory.createForClass(RasDebiteur);
RasDebiteurSchema.index({ companyId: 1, exercice: 1, mois: 1 });
RasDebiteurSchema.index({ companyId: 1, reversee: 1 });
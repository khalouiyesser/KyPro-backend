import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RasBeneficiaireDocument = RasBeneficiaire & Document;

@Schema({ timestamps: true })
export class RasBeneficiaire {
    @Prop({ type: Types.ObjectId, ref: 'Vente', required: false })
    venteId?: Types.ObjectId;

    @Prop({ type: Types.ObjectId, ref: 'Client', required: false })
    clientId?: Types.ObjectId;

    @Prop({ required: true }) clientName:          string;
    @Prop({ required: true }) matriculeClient:     string;
    @Prop({ required: true }) numeroCertificatTEJ: string;
    @Prop({ required: true }) codeOperation:       string;
    @Prop({ required: true }) montantBrut:         number;
    @Prop({ required: true }) tauxRAS:             number;
    @Prop({ required: true }) montantRAS:          number;
    @Prop({ required: true }) dateEncaissement:    Date;
    @Prop({ required: true }) exercice:            number;
    @Prop({ required: true }) mois:               number;
    @Prop({ default: false }) utilise:            boolean;

    @Prop({ type: Types.ObjectId, ref: 'Company', required: true })
    companyId: Types.ObjectId;

    @Prop({ type: Types.ObjectId, ref: 'User', required: false })
    createdBy?: Types.ObjectId;
}

export const RasBeneficiaireSchema = SchemaFactory.createForClass(RasBeneficiaire);
RasBeneficiaireSchema.index({ companyId: 1, exercice: 1, mois: 1 });
RasBeneficiaireSchema.index(
    { companyId: 1, numeroCertificatTEJ: 1 },
    { unique: true, sparse: true },
);
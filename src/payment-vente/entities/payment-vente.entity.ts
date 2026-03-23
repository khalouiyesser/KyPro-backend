// import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
// import { Document, Types } from 'mongoose';
// export type PaymentVenteDocument = PaymentVente & Document;
//
// @Schema({ timestamps: true })
// export class PaymentVente {
//   @Prop({ type: Types.ObjectId, ref: 'Client', required: true }) clientId: Types.ObjectId;
//   @Prop({ required: true }) amount: number;
//   @Prop() note: string;
//   @Prop({ type: Types.ObjectId, ref: 'Vente', required: false }) venteId: Types.ObjectId;
//   @Prop({ type: Types.ObjectId, ref: 'Company', required: true }) companyId: Types.ObjectId;
//   @Prop({ type: Types.ObjectId, ref: 'User', required: true }) userId: Types.ObjectId;
// }
// export const PaymentVenteSchema = SchemaFactory.createForClass(PaymentVente);


import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PaymentVenteDocument = PaymentVente & Document;

@Schema({ timestamps: true })
export class PaymentVente {
  @Prop({ type: Types.ObjectId, ref: 'User',    required: true }) userId:    Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'Client',  required: true }) clientId:  Types.ObjectId;

  // venteId est optionnel : absent quand le paiement vient du client directement
  @Prop({ type: Types.ObjectId, ref: 'Vente', required: false })
  venteId?: Types.ObjectId;

  @Prop({ required: true })           amount:    number;
  @Prop()                             note:      string;
  @Prop({ type: Types.ObjectId, ref: 'Company', required: true }) companyId: Types.ObjectId;
}

export const PaymentVenteSchema = SchemaFactory.createForClass(PaymentVente);

PaymentVenteSchema.index({ companyId: 1, clientId: 1, createdAt: -1 });
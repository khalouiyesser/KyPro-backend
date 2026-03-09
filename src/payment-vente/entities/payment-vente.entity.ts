import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
export type PaymentVenteDocument = PaymentVente & Document;

@Schema({ timestamps: true })
export class PaymentVente {
  @Prop({ type: Types.ObjectId, ref: 'Client', required: true }) clientId: Types.ObjectId;
  @Prop({ required: true }) amount: number;
  @Prop() note: string;
  @Prop({ type: Types.ObjectId, ref: 'Vente', required: false }) venteId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'Company', required: true }) companyId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'User', required: true }) userId: Types.ObjectId;
}
export const PaymentVenteSchema = SchemaFactory.createForClass(PaymentVente);

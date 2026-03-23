// import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
// import { Document, Types } from 'mongoose';
// export type VenteDocument = Vente & Document;
// export enum Ventestatus { PENDING='pending', PARTIAL='partial', PAID='paid' }
// @Schema({ timestamps: true })
// export class Vente {
//   @Prop({ type: Types.ObjectId, ref: 'Client', required: true }) clientId: Types.ObjectId;
//   @Prop({ required: true }) clientName: string;
//   @Prop({ type: [{ productId: { type: Types.ObjectId, ref: 'Product' }, productName: String, quantity: Number, unitPrice: Number, tva: Number, totalHT: Number, totalTTC: Number }], default: [] }) items: any[];
//   @Prop({ required: true }) totalHT: number;
//   @Prop({ required: true }) totalTTC: number;
//   @Prop({ default: 0 }) amountPaid: number;
//   @Prop({ default: 0 }) amountRemaining: number;
//   @Prop({ type: String, enum: Ventestatus, default: Ventestatus.PENDING }) status: Ventestatus;
//   @Prop({ type: [{ amount: Number, date: Date, note: String, method: String }], default: [] }) payments: any[];
//   @Prop() paymentMethod: string;
//   @Prop() notes: string;
//   @Prop({ type: Types.ObjectId, ref: 'Company', required: true }) companyId: Types.ObjectId;
//   @Prop({ type: Types.ObjectId, ref: 'User', required: true }) createdBy: Types.ObjectId;
//   @Prop() createdByName: string;
// }
// export const Venteschema = SchemaFactory.createForClass(Vente);
// Venteschema.index({ companyId: 1, createdAt: -1 });

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type VenteDocument = Vente & Document;

export enum Ventestatus {
  PENDING = 'pending',
  PARTIAL = 'partial',
  PAID    = 'paid',
}

@Schema({ timestamps: true })
export class Vente {
  @Prop({ type: Types.ObjectId, ref: 'Client', required: true })
  clientId: Types.ObjectId;

  @Prop({ required: true })
  clientName: string;

  @Prop({
    type: [{
      productId:   { type: Types.ObjectId, ref: 'Product' },
      productName: String,
      quantity:    Number,
      unitPrice:   Number,
      tva:         Number,
      totalHT:     Number,
      totalTTC:    Number,
    }],
    default: [],
  })
  items: any[];

  @Prop({ required: true }) totalHT:         number;
  @Prop({ required: true }) totalTTC:        number;
  @Prop({ default: 0 })     amountPaid:      number;
  @Prop({ default: 0 })     amountRemaining: number;

  @Prop({ type: String, enum: Ventestatus, default: Ventestatus.PENDING })
  status: Ventestatus;

  @Prop({
    type: [{
      amount: Number,
      date:   Date,
      note:   String,
      method: String,
    }],
    default: [],
  })
  payments: any[];

  @Prop() paymentMethod:  string;
  @Prop() notes:          string;

  // ── Champ ajouté : mis à jour par ────────────────────────
  @Prop() updatedByName: string;

  @Prop({ type: Types.ObjectId, ref: 'Company', required: true }) companyId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'User',    required: true }) createdBy: Types.ObjectId;
  @Prop() createdByName: string;
}

export const VenteSchema = SchemaFactory.createForClass(Vente);

VenteSchema.index({ companyId: 1, createdAt: -1 });

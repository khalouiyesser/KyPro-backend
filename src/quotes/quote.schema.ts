// import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
// import { Document, Types } from 'mongoose';
// export type QuoteDocument = Quote & Document;
// export enum QuoteStatus { DRAFT='draft', SENT='sent', ACCEPTED='accepted', REJECTED='rejected', EXPIRED='expired' }
// @Schema({ timestamps: true })
// export class Quote {
//   @Prop({ required: true }) clientName: string;
//   @Prop() clientPhone: string;
//   @Prop() clientEmail: string;
//   @Prop({ type: Types.ObjectId, ref: 'Client' }) clientId: Types.ObjectId;
//   @Prop({ type: [{ productId: { type: Types.ObjectId, ref: 'Product' }, productName: String, quantity: Number, unitPrice: Number, tva: Number, totalHT: Number, totalTTC: Number }], default: [] })
//   items: any[];
//   @Prop({ required: true }) totalHT: number;
//   @Prop({ required: true }) totalTTC: number;
//   @Prop({ type: String, enum: QuoteStatus, default: QuoteStatus.DRAFT }) status: QuoteStatus;
//   @Prop() validUntil: Date;
//   @Prop() notes: string;
//   @Prop({ type: Types.ObjectId, ref: 'Company', required: true }) companyId: Types.ObjectId;
//   @Prop({ type: Types.ObjectId, ref: 'User', required: true }) createdBy: Types.ObjectId;
//   @Prop() createdByName: string;
// }
// export const QuoteSchema = SchemaFactory.createForClass(Quote);
// QuoteSchema.index({ companyId: 1, createdAt: -1 });
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type QuoteDocument = Quote & Document;

export enum QuoteStatus {
  DRAFT    = 'draft',
  SENT     = 'sent',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  EXPIRED  = 'expired',
}

// ── Sub-schema pour les lignes de devis ──────────────────────────────────────
@Schema({ _id: false })
export class QuoteItem {
  @Prop({ type: Types.ObjectId, ref: 'Product' }) productId?: Types.ObjectId;
  @Prop({ required: true })  productName: string;
  @Prop({ required: true, min: 0.001 }) quantity: number;
  @Prop({ required: true, min: 0 })     unitPrice: number; // Prix unitaire HT
  @Prop({ required: true, min: 0, max: 100, default: 19 }) tva: number; // Taux TVA %
  @Prop({ required: true, min: 0 }) totalHT:  number; // quantity × unitPrice
  @Prop({ required: true, min: 0 }) totalTVA: number; // totalHT × tva/100 (NEW)
  @Prop({ required: true, min: 0 }) totalTTC: number; // totalHT + totalTVA
}

// ── Schema principal Quote ───────────────────────────────────────────────────
@Schema({ timestamps: true })
export class Quote {
  // Numéro séquentiel lisible (ex: DEV-2024-0042)
  @Prop({ unique: true, sparse: true }) quoteNumber?: string;

  // Client
  @Prop({ required: true }) clientName: string;
  @Prop()                   clientPhone: string;
  @Prop()                   clientEmail: string;
  @Prop()                   clientAddress: string; // Ajouté : utilisé dans le frontend
  @Prop({ type: Types.ObjectId, ref: 'Client' }) clientId?: Types.ObjectId;

  // Lignes
  @Prop({
    type: [
      {
        _id:         false,
        productId:   { type: Types.ObjectId, ref: 'Product' },
        productName: { type: String,  required: true },
        quantity:    { type: Number,  required: true, min: 0.001 },
        unitPrice:   { type: Number,  required: true, min: 0 },
        tva:         { type: Number,  required: true, min: 0, max: 100, default: 19 },
        totalHT:     { type: Number,  required: true, min: 0 },
        totalTVA:    { type: Number,  required: true, min: 0 }, // NOUVEAU
        totalTTC:    { type: Number,  required: true, min: 0 },
      },
    ],
    default: [],
  })
  items: QuoteItem[];

  // Totaux (calculés côté service, jamais acceptés du client tel quel)
  @Prop({ required: true, min: 0 }) totalHT:  number;
  @Prop({ required: true, min: 0 }) totalTVA: number; // NOUVEAU
  @Prop({ required: true, min: 0 }) totalTTC: number;

  // Statut & validité
  @Prop({ type: String, enum: QuoteStatus, default: QuoteStatus.DRAFT })
  status: QuoteStatus;

  @Prop() validUntil?: Date;
  @Prop() notes?: string;

  // Référence vers la vente créée lors de la conversion (NEW)
  @Prop({ type: Types.ObjectId, ref: 'Vente' }) convertedSaleId?: Types.ObjectId;

  // Références obligatoires
  @Prop({ type: Types.ObjectId, ref: 'Company', required: true }) companyId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'User',    required: true }) createdBy: Types.ObjectId;
  @Prop() createdByName: string;
}

export const QuoteSchema = SchemaFactory.createForClass(Quote);

// Index principaux
QuoteSchema.index({ companyId: 1, createdAt: -1 });
QuoteSchema.index({ companyId: 1, status: 1 });
QuoteSchema.index({ quoteNumber: 1 }, { unique: true, sparse: true });
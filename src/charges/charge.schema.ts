import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { ApiProperty } from '@nestjs/swagger';

export type ChargeDocument = Charge & Document;

export enum ChargeType {
  RENT       = 'rent',
  SALARY     = 'salary',
  UTILITIES  = 'utilities',
  EQUIPMENT  = 'equipment',
  MARKETING  = 'marketing',
  TAX        = 'tax',
  INSURANCE  = 'insurance',
  ACCOUNTING = 'accounting',
  FUEL       = 'fuel',
  OTHER      = 'other',
}

// ── Sous-document ChargeItem ──────────────────────────────────────────────────
@Schema({ _id: false })
export class ChargeItem {
  @ApiProperty({ description: 'Désignation de la ligne', example: 'SOURIS RAMITECH USB TB220' })
  @Prop({ required: true })
  label: string;

  @ApiProperty({ description: 'Montant TTC de la ligne', example: 8.0 })
  @Prop({ required: true })
  total: number;
}
export const ChargeItemSchema = SchemaFactory.createForClass(ChargeItem);

// ── Charge ────────────────────────────────────────────────────────────────────
@Schema({ timestamps: true })
export class Charge {
  @ApiProperty({ description: 'Description / nom du fournisseur', example: 'Facture E-INFO N°68' })
  @Prop({ required: true })
  description: string;

  @ApiProperty({ description: 'Montant TTC total', example: 279.0 })
  @Prop({ required: true })
  amount: number;

  @ApiProperty({ description: 'Montant HT total', example: 273.682, required: false })
  @Prop({ default: null })
  amountHT: number;

  @ApiProperty({ description: 'Taux TVA (%)', example: 7, default: 0 })
  @Prop({ default: 0 })
  tva: number;

  @ApiProperty({ description: 'Date de la facture', example: '2024-03-16' })
  @Prop({ required: true })
  date: Date;

  @ApiProperty({
    description: 'Type de charge',
    enum: ChargeType,
    default: ChargeType.OTHER,
  })
  @Prop({ type: String, enum: ChargeType, default: ChargeType.OTHER })
  type: ChargeType;

  @ApiProperty({ description: 'Numéro de facture / référence', example: '68', required: false })
  @Prop({ default: null })
  source: string;

  @ApiProperty({ description: 'URL ou base64 de la facture', required: false })
  @Prop({ default: null })
  imageUrl: string;

  @ApiProperty({ description: 'Notes libres', required: false })
  @Prop({ default: null })
  notes: string;

  @ApiProperty({ description: 'Devise', enum: ['TND', 'EUR', 'USD', 'other'], default: 'TND' })
  @Prop({ default: 'TND' })
  currency: string;

  @ApiProperty({ description: 'Est un devis (true) ou une facture (false)', default: false })
  @Prop({ default: false })
  isDevis: boolean;

  // ── Lignes de facturation (issues de l'OCR ou saisies manuellement) ─────────
  @ApiProperty({ description: 'Lignes de facturation', type: [ChargeItem] })
  @Prop({ type: [ChargeItemSchema], default: [] })
  items: ChargeItem[];

  @Prop({ type: Types.ObjectId, ref: 'Company', required: true })
  companyId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  @Prop()
  createdByName: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  updatedBy: Types.ObjectId;

  @Prop()
  updatedByName: string;
}

export const ChargeSchema = SchemaFactory.createForClass(Charge);
ChargeSchema.index({ companyId: 1, date: -1 });
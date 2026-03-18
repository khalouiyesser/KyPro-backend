import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type FournisseurDocument = Fournisseur & Document;

@Schema({ timestamps: true })
export class Fournisseur {
  @Prop({ required: true })
  name: string;
  @Prop({ required: true })
  phone: string;
  @Prop()
  email: string;
  @Prop()
  notes: string;
  @Prop()
  address: string;
  @Prop({ default: 0 })
  totalDebt: number;

  // ✅ FIX : références vers Product au lieu de sous-documents embedded
  @Prop({ type: [{ type: Types.ObjectId, ref: 'Product' }], default: [] })
  products: Types.ObjectId[];

  @Prop({ type: Types.ObjectId, ref: 'Company', required: true })
  companyId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;
  @Prop()
  createdByName: string;
}

export const FournisseurSchema = SchemaFactory.createForClass(Fournisseur);
FournisseurSchema.index({ phone: 1, companyId: 1 }, { unique: true });
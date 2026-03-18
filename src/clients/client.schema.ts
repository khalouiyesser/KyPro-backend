import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
export type ClientDocument = Client & Document;
@Schema({ timestamps: true })
export class Client {
  @Prop({ required: true }) name: string;
  @Prop({ required: true }) phone: string;
  @Prop() email: string;
  @Prop() sector: string;
  @Prop({ default: true }) isActive: boolean;
  @Prop({ default: 0 }) creditLimit: number;
  @Prop({ default: 0 }) creditUsed: number;
  @Prop({ default: '' }) notes: string;
  @Prop({ type: Types.ObjectId, ref: 'Company', required: true }) companyId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'User', required: true }) createdBy: Types.ObjectId;
  @Prop({ default: 'admin' }) createdByName: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) updatedBy: Types.ObjectId;
  @Prop() updatedByName: string;
}
export const ClientSchema = SchemaFactory.createForClass(Client);
ClientSchema.index({ phone: 1, companyId: 1 }, { unique: true });
ClientSchema.index({ companyId: 1 });

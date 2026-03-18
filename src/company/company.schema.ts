import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
export type CompanyDocument = Company & Document;
export enum SubscriptionPlan { TRIAL = 'trial', STARTER = 'starter', PROFESSIONAL = 'professional', ENTERPRISE = 'enterprise' }
export enum SubscriptionStatus { ACTIVE = 'active', TRIAL = 'trial', SUSPENDED = 'suspended', EXPIRED = 'expired', CANCELLED = 'cancelled' }
@Schema({ timestamps: true })
export class Company {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true })
  email: string;


  @Prop({ required: true, unique: true })
  phone: string;

  @Prop()
  address: string;

  @Prop()
  city: string;

  @Prop({ default: 'Tunisie' })
  country: string;

  @Prop({ unique: true, sparse: true })
  matriculeFiscal: string;

  @Prop()
  rne: string;

  @Prop()
  fiscalRegime: string;

  @Prop()
  activityType: string;

  @Prop({ default: '#2563EB' })
  primaryColor: string;

  @Prop()
  logoUrl: string;

  @Prop({ type: String, enum: SubscriptionPlan, default: SubscriptionPlan.TRIAL })
  plan: SubscriptionPlan;

  @Prop({ type: String, enum: SubscriptionStatus, default: SubscriptionStatus.TRIAL })
  subscriptionStatus: SubscriptionStatus;

  @Prop()
  subscriptionStartAt: Date;

  @Prop()
  subscriptionExpiresAt: Date;

  @Prop({ default: 0 })
  amountPaid: number;

  @Prop({ default: 100 })
  ocrLimitPerMonth: number;

  @Prop({ default: 100 })
  ocrAttemptsLeft: number;

  @Prop({ type: Date, default: null })
  ocrResetAt: Date;

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  notes: string;

}
export const CompanySchema = SchemaFactory.createForClass(Company);

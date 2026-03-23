import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type EmployeeDocument = Employee & Document;

@Schema({ timestamps: true })
export class Employee {
  // FIX : nom → firstName + lastName (cohérence avec le frontend)
  @Prop({ required: true }) firstName: string;
  @Prop({ required: true }) lastName:  string;

  @Prop()                   phone:        string;
  @Prop()                   email:        string;
  @Prop()                   position:     string;
  @Prop()                   department:   string;

  // FIX : contractType et champs RH manquants dans l'ancien schema
  @Prop({ default: 'CDI' }) contractType: string;
  @Prop({ default: 0 })     salary:       number;
  @Prop()                   hireDate:     Date;
  @Prop()                   cin:          string;
  @Prop()                   cnss:         string;
  @Prop()                   rib:          string;

  @Prop({ default: true })  isActive:     boolean;
  @Prop({ default: '' })    notes:        string;

  // NOUVEAU : lien vers le compte User créé automatiquement
  @Prop({ type: Types.ObjectId, ref: 'User' }) userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Company', required: true }) companyId:     Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'User',    required: true }) createdBy:     Types.ObjectId;
  @Prop()                                                          createdByName: string;
}

export const EmployeeSchema = SchemaFactory.createForClass(Employee);
EmployeeSchema.index({ companyId: 1 });
EmployeeSchema.index({ userId: 1 }, { sparse: true });
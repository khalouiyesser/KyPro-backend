import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { Company, CompanySchema } from '../company/company.schema';
import { User, UserSchema } from '../users/user.schema';
import {Client, ClientSchema} from "../clients/client.schema";

@Module({
  imports: [MongooseModule.forFeature([{ name: Company.name, schema: CompanySchema },
    { name: User.name, schema: UserSchema },
    { name: Client.name, schema: ClientSchema }])],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}

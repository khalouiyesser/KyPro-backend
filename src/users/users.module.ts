import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './user.schema';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    CommonModule, // ✅ requis pour MailService
  ],
  controllers: [UsersController],
  providers: [UsersService],              // ✅ manquait
  exports: [UsersService, MongooseModule], // ✅ utile pour AuthModule
})
export class UsersModule {}
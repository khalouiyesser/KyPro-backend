import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { User, UserDocument } from './user.schema';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { MailService } from '../common/services/mail.service';
import {Roles} from "../common/decorators/roles.decorator";

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private mailService: MailService,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<UserDocument> {
    const existing = await this.userModel.findOne({ email: createUserDto.email });
    if (existing) throw new ConflictException('Email already exists');

    const tempPassword = this.generateTempPassword();
    const hashed = await bcrypt.hash(tempPassword, 12);

    const user = new this.userModel({
      ...createUserDto,
      password: hashed,
      mustChangePassword: true,
    });
    await user.save();

    // Send welcome email with temp password
    await this.mailService.sendWelcomeEmail(user.email, user.name, tempPassword);

    return user;
  }

  async createAdmin(email: string,password:string): Promise<UserDocument> {
    const existing = await this.userModel.findOne({ email: email });
    if (existing) throw new ConflictException('Email already exists');

    // const tempPassword = this.generateTempPassword();
    const hashed = await bcrypt.hash(password, 12);

    const user = new this.userModel({
      phone: "00000000",
      name: "yesser",
      email: email,
      password: hashed,
      role: "system_admin",
      mustChangePassword: true,
    });
    await user.save();

    // Send welcome email with temp password
    await this.mailService.sendWelcomeEmail(user.email, user.name, password);

    return user;
  }

  async findAll(): Promise<UserDocument[]> {
    return this.userModel.find().select('-password').exec();
  }

  async findOne(id: string): Promise<UserDocument> {
    const user = await this.userModel.findById(id).select('-password');
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findByEmail(email: string): Promise<UserDocument> {
    return this.userModel.findOne({ email: email.toLowerCase() });
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<UserDocument> {
    const user = await this.userModel
      .findByIdAndUpdate(id, updateUserDto, { new: true })
      .select('-password');
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async remove(id: string): Promise<void> {
    const user = await this.userModel.findByIdAndDelete(id);
    if (!user) throw new NotFoundException('User not found');
  }

  async changePassword(id: string, newPassword: string): Promise<void> {
    const hashed = await bcrypt.hash(newPassword, 12);
    await this.userModel.findByIdAndUpdate(id, {
      password: hashed,
      mustChangePassword: false,
    });
  }

  async decrementOcrAttempts(userId: string): Promise<number> {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    // Reset monthly if needed
    const now = new Date();
    if (!user.ocrAttemptsResetAt || this.isNewMonth(user.ocrAttemptsResetAt, now)) {
      user.ocrAttemptsLeft = 5;
      user.ocrAttemptsResetAt = now;
    }

    if (user.ocrAttemptsLeft <= 0) return 0;

    user.ocrAttemptsLeft -= 1;
    await user.save();
    return user.ocrAttemptsLeft;
  }

  private generateTempPassword(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#!';
    return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  }

  private isNewMonth(lastReset: Date, now: Date): boolean {
    return (
      lastReset.getMonth() !== now.getMonth() ||
      lastReset.getFullYear() !== now.getFullYear()
    );
  }
}

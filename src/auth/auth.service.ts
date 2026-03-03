import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { User, UserDocument, UserRole } from '../users/user.schema';
import { Company, CompanyDocument } from '../company/company.schema';
import { MailService } from '../common/services/mail.service';
import {use} from "passport";

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Company.name) private companyModel: Model<CompanyDocument>,
    private jwtService: JwtService,
    private mailService: MailService,
  ) {}

  async validateUser(email: string, password: string): Promise<UserDocument | null> {
    const user = await this.userModel.findOne({ email: email.toLowerCase().trim() });
    if (!user) return null;
    if (!user.isActive) throw new UnauthorizedException('Compte désactivé. Contactez votre administrateur.');
    if (user.lockedUntil && new Date() < user.lockedUntil) {
      const remaining = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      throw new UnauthorizedException('Compte verrouillé. Réessayez dans ' + remaining + ' minute(s).');
    }
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
      if (user.failedLoginAttempts >= 5) { user.lockedUntil = new Date(Date.now() + 30 * 60 * 1000); user.failedLoginAttempts = 0; }
      await user.save();
      return null;
    }
    user.failedLoginAttempts = 0; user.lockedUntil = null; user.lastLoginAt = new Date();
    await user.save();
    return user;
  }

  async login(user: UserDocument) {


    console.log(user);
    if (user.role !== UserRole.SYSTEM_ADMIN && user.companyId) {
      const company = await this.companyModel.findById(user.companyId).lean();
      if (!company) throw new UnauthorizedException('Company introuvable');
      if (!company.isActive) throw new UnauthorizedException('Votre company est désactivée. Contactez le support.');
      if (company.subscriptionStatus === 'expired') throw new UnauthorizedException('Abonnement expiré. Contactez votre administrateur.');
      if (company.subscriptionStatus === 'suspended') throw new UnauthorizedException('Compte suspendu. Contactez le support.');
    }
    const payload = { sub: (user._id as any).toString(), email: user.email, role: user.role, companyId: user.companyId?.toString() || null, name: user.name };
    let company = null;
    if (user.companyId) {
      const c = await this.companyModel.findById(user.companyId).lean();
      if (c) company = { id: (c as any)._id.toString(), name: c.name, email: c.email, phone: c.phone, address: c.address, city: c.city, country: c.country, matriculeFiscal: c.matriculeFiscal, rne: c.rne, fiscalRegime: c.fiscalRegime, activityType: c.activityType, primaryColor: c.primaryColor, logoUrl: c.logoUrl, plan: c.plan, subscriptionStatus: c.subscriptionStatus, subscriptionExpiresAt: c.subscriptionExpiresAt, ocrAttemptsLeft: c.ocrAttemptsLeft, ocrLimitPerMonth: c.ocrLimitPerMonth };
    }
    return {
      access_token: this.jwtService.sign(payload),
      user: { id: (user._id as any).toString(), name: user.name, email: user.email, role: user.role, position: user.position, theme: user.theme, mustChangePassword: user.mustChangePassword, companyId: user.companyId?.toString() || null },
      company,
    };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new BadRequestException('Utilisateur introuvable');
    if (!(await bcrypt.compare(currentPassword, user.password))) throw new BadRequestException('Mot de passe actuel incorrect');
    if (newPassword.length < 8) throw new BadRequestException('Le nouveau mot de passe doit contenir au moins 8 caractères');
    user.password = await bcrypt.hash(newPassword, 12);
    user.mustChangePassword = false;
    await user.save();
    return { message: 'Mot de passe modifié avec succès' };
  }

  async requestPasswordReset(email: string) {
    const user = await this.userModel.findOne({ email: email.toLowerCase() });
    if (!user) return { message: 'Cet email est incorrecte.' };
    const token = crypto.randomInt(100000, 999999).toString();
    user.passwordResetToken = await bcrypt.hash(token, 10);
    user.passwordResetExpires = new Date(Date.now() + 3600000);
    await user.save();
    await this.mailService.sendPasswordReset(user.email, user.name, token);
    return { message: 'Si cet email existe, un code a été envoyé.' };
  }

  async resetPassword(email: string, token: string, newPassword: string) {
    const user = await this.userModel.findOne({ email: email.toLowerCase(), passwordResetExpires: { $gt: new Date() } });
    if (!user || !user.passwordResetToken) throw new BadRequestException('Token invalide ou expiré');
    if (!(await bcrypt.compare(token, user.passwordResetToken))) throw new BadRequestException('Code incorrect');
    user.password = await bcrypt.hash(newPassword, 12);
    user.passwordResetToken = null; user.passwordResetExpires = null; user.mustChangePassword = false;
    await user.save();
    return { message: 'Mot de passe réinitialisé avec succès' };
  }
}

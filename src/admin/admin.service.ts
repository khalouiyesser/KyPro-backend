import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { Company, CompanyDocument, SubscriptionStatus, SubscriptionPlan } from '../company/company.schema';
import { User, UserDocument, UserRole } from '../users/user.schema';
import { MailService } from '../common/services/mail.service';
import {CreateCompanyWithAdminDto} from "./dto/create-company-with-admin.dto";

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(Company.name) private companyModel: Model<CompanyDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private mailService: MailService,
  ) {}

  async getSystemDashboard() {
    const [total, active, trial, expired, suspended, totalUsers, activeUsers, revenueAgg, byPlan, recent] = await Promise.all([
      this.companyModel.countDocuments(),
      this.companyModel.countDocuments({ subscriptionStatus: 'active' }),
      this.companyModel.countDocuments({ subscriptionStatus: 'trial' }),
      this.companyModel.countDocuments({ subscriptionStatus: 'expired' }),
      this.companyModel.countDocuments({ subscriptionStatus: 'suspended' }),
      this.userModel.countDocuments({ role: { $ne: UserRole.SYSTEM_ADMIN } }),
      this.userModel.countDocuments({ isActive: true, role: { $ne: UserRole.SYSTEM_ADMIN } }),
      this.companyModel.aggregate([{ $group: { _id: null, total: { $sum: '$amountPaid' } } }]),
      this.companyModel.aggregate([{ $group: { _id: '$plan', count: { $sum: 1 } } }]),
      this.companyModel.find().sort({ createdAt: -1 }).limit(10).lean(),
    ]);
    return {
      companies: { total, active, trial, expired, suspended },
      users: { total: totalUsers, active: activeUsers },
      revenue: { total: revenueAgg[0]?.total || 0 },
      byPlan,
      recentCompanies: recent,
    };
  }

  async createCompany(dto: any) {
    const existing = await this.companyModel.findOne({ $or: [{ email: dto.email }, { phone: dto.phone }] });
    if (existing) throw new ConflictException('Email ou téléphone déjà utilisé');
    const company = new this.companyModel({ ...dto, subscriptionStatus: SubscriptionStatus.TRIAL, plan: SubscriptionPlan.TRIAL, ocrAttemptsLeft: 400, ocrLimitPerMonth: 400, ocrResetAt: new Date(), isActive: true });
    const saved = await company.save();
    const tempPassword = this.genPassword();
    const admin = new this.userModel({ name: dto.adminName || 'Admin ' + dto.name, email: dto.email, phone: dto.phone, password: await bcrypt.hash(tempPassword, 12), role: UserRole.ADMIN_COMPANY, companyId: saved._id, mustChangePassword: true, isActive: true });
    await admin.save();
    await this.mailService.sendWelcomeEmail(dto.email, admin.name, tempPassword);
    const a = admin.toObject() as any; delete a.password;
    return { company: saved, adminUser: a, tempPassword };
  }

  async findAllCompanies(query: any = {}) {
    const filter: any = {};
    if (query.search) filter.$or = [{ name: { $regex: query.search, $options: 'i' } }, { email: { $regex: query.search, $options: 'i' } }];
    if (query.status) filter.subscriptionStatus = query.status;
    if (query.plan) filter.plan = query.plan;
    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 20;
    const [companies, total] = await Promise.all([
      this.companyModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      this.companyModel.countDocuments(filter),
    ]);
    return { companies, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async findCompanyById(id: string) {
    const company = await this.companyModel.findById(id).lean();
    if (!company) throw new NotFoundException('Company introuvable');
    const users = await this.userModel.find({ companyId: new Types.ObjectId(id) }).select('-password').lean();
    return { ...company, users };
  }

  async updateCompany(id: string, dto: any) {
    const c = await this.companyModel.findByIdAndUpdate(id, dto, { new: true });
    if (!c) throw new NotFoundException('Company introuvable');
    return c;
  }

  async deleteCompany(id: string) {
    const c = await this.companyModel.findByIdAndDelete(id);
    if (!c) throw new NotFoundException('Company introuvable');
    await this.userModel.updateMany({ companyId: new Types.ObjectId(id) }, { isActive: false });
    return { message: 'Company supprimée et utilisateurs désactivés' };
  }

  async updateSubscription(companyId: string, dto: { plan: SubscriptionPlan; status: SubscriptionStatus; expiresAt: string; amountPaid?: number; notes?: string }) {
    const c = await this.companyModel.findById(companyId);
    if (!c) throw new NotFoundException('Company introuvable');
    c.plan = dto.plan; c.subscriptionStatus = dto.status;
    c.subscriptionExpiresAt = new Date(dto.expiresAt); c.subscriptionStartAt = new Date();
    if (dto.amountPaid) c.amountPaid = (c.amountPaid || 0) + dto.amountPaid;
    if (dto.notes) c.notes = dto.notes;
    if (dto.status === SubscriptionStatus.ACTIVE) c.isActive = true;
    if (dto.status === SubscriptionStatus.EXPIRED || dto.status === SubscriptionStatus.SUSPENDED) c.isActive = false;
    await c.save();
    const adminUser = await this.userModel.findOne({ companyId: new Types.ObjectId(companyId), role: UserRole.ADMIN_COMPANY });
    if (adminUser) await this.mailService.sendSubscriptionAlert(adminUser.email, c.name, 'Abonnement mis à jour: Plan ' + dto.plan + ', valable jusqu\'au ' + new Date(dto.expiresAt).toLocaleDateString('fr-TN') + '. Montant payé: ' + (dto.amountPaid || 0) + ' TND.');
    return c;
  }

  async suspendCompany(id: string, reason: string) {
    const c = await this.companyModel.findByIdAndUpdate(id, { subscriptionStatus: SubscriptionStatus.SUSPENDED, isActive: false, notes: reason }, { new: true });
    if (!c) throw new NotFoundException('Company introuvable');
    const admin = await this.userModel.findOne({ companyId: new Types.ObjectId(id), role: UserRole.ADMIN_COMPANY });
    if (admin) await this.mailService.sendSubscriptionAlert(admin.email, c.name, 'Compte suspendu. Raison: ' + reason + '. Contactez le support.');
    return c;
  }

  async reactivateCompany(id: string) {
    const c = await this.companyModel.findByIdAndUpdate(id, { subscriptionStatus: SubscriptionStatus.ACTIVE, isActive: true }, { new: true });
    if (!c) throw new NotFoundException('Company introuvable');
    return c;
  }

  async checkExpiredSubscriptions() {
    const result = await this.companyModel.updateMany(
      { subscriptionStatus: { $in: ['active', 'trial'] }, subscriptionExpiresAt: { $lte: new Date() } },
      { subscriptionStatus: SubscriptionStatus.EXPIRED, isActive: false },
    );
    return { message: result.modifiedCount + ' abonnement(s) expiré(s)' };
  }

  async resetOcr(companyId: string) {
    const c = await this.companyModel.findByIdAndUpdate(companyId, { ocrAttemptsLeft: 400, ocrResetAt: new Date() }, { new: true });
    if (!c) throw new NotFoundException('Company introuvable');
    return { message: 'Quota OCR réinitialisé à 400', ocrAttemptsLeft: c.ocrAttemptsLeft };
  }

  async updateOcrLimit(companyId: string, limit: number) {
    const c = await this.companyModel.findByIdAndUpdate(companyId, { ocrLimitPerMonth: limit, ocrAttemptsLeft: limit }, { new: true });
    if (!c) throw new NotFoundException('Company introuvable');
    return c;
  }

  async getAllUsers(query: any = {}) {
    const filter: any = { role: { $ne: UserRole.SYSTEM_ADMIN } };
    if (query.companyId) filter.companyId = new Types.ObjectId(query.companyId);
    if (query.search) filter.$or = [{ name: { $regex: query.search, $options: 'i' } }, { email: { $regex: query.search, $options: 'i' } }];
    const [users, total] = await Promise.all([
      this.userModel.find(filter).select('-password').populate('companyId', 'name subscriptionStatus').sort({ createdAt: -1 }).limit(100),
      this.userModel.countDocuments(filter),
    ]);
    return { users, total };
  }

  async toggleUserActive(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    user.isActive = !user.isActive;
    await user.save();
    return { message: 'Utilisateur ' + (user.isActive ? 'activé' : 'désactivé'), isActive: user.isActive };
  }

  async resetUserPassword(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    const tempPassword = this.genPassword();
    user.password = await bcrypt.hash(tempPassword, 12);
    user.mustChangePassword = true;
    await user.save();
    await this.mailService.sendWelcomeEmail(user.email, user.name, tempPassword);
    return { message: 'Mot de passe réinitialisé, email envoyé', tempPassword };
  }

  async createSystemAdmin(email: string, name: string, password: string) {
    const existing = await this.userModel.findOne({ email: email.toLowerCase() });
    if (existing) throw new ConflictException('Email déjà utilisé');
    const admin = new this.userModel({ name, email: email.toLowerCase(), phone: '00000000', password: await bcrypt.hash(password, 12), role: UserRole.SYSTEM_ADMIN, isActive: true, mustChangePassword: false });
    await admin.save();
    const a = admin.toObject() as any; delete a.password;
    return a;
  }

  private genPassword(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#!';
    return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  }





  async createCompanyWithAdmin(dto: CreateCompanyWithAdminDto) {
    // 1. Unicité email company
    if (await this.companyModel.findOne({ email: dto.company.email }))
      throw new ConflictException('Email entreprise déjà utilisé');

    // 2. Unicité email admin
    if (await this.userModel.findOne({ email: dto.admin.email.toLowerCase() }))
      throw new ConflictException('Email administrateur déjà utilisé');

    // 3. Créer la company
    const company = await new this.companyModel({
      ...dto.company,
      country:            dto.company.country ?? 'Tunisie',
      plan:               dto.company.plan ?? 'trial',
      subscriptionStatus: dto.company.subscriptionStatus ?? 'trial',
      amountPaid:         dto.company.amountPaid ?? 0,
      ocrLimitPerMonth:   dto.company.ocrLimitPerMonth ?? 400,
      ocrAttemptsLeft:    dto.company.ocrLimitPerMonth ?? 400,
      primaryColor:       dto.company.primaryColor ?? '#2563EB',
      assujettTVA:        dto.company.assujettTVA ?? true,
    }).save();

    // 4. Créer l'admin lié à la company
    const tempPassword = this.genPassword();
    const admin = await new this.userModel({
      name:               dto.admin.name,
      email:              dto.admin.email.toLowerCase(),
      phone:              dto.admin.phone,
      password:           await bcrypt.hash(tempPassword, 12),
      role:               UserRole.ADMIN_COMPANY,
      companyId:          company._id,
      mustChangePassword: true,
      isActive:           true,
    }).save();

    // 5. Email de bienvenue
    await this.mailService.sendWelcomeEmail(admin.email, admin.name, tempPassword);

    const adminObj = admin.toObject() as any;
    delete adminObj.password;

    return {
      message: `Entreprise "${company.name}" créée avec succès`,
      company,
      admin: adminObj,
    };
  }

  // private genPassword(): string {
  //   const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#!';
  //   return Array.from({ length: 12 }, () =>
  //       chars[Math.floor(Math.random() * chars.length)]
  //   ).join('');
  // }
}

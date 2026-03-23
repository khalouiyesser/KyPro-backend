import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types }  from 'mongoose';
import * as bcrypt       from 'bcryptjs';
import { Employee, EmployeeDocument } from './employee.schema';
import { UserRole }      from '../users/user.schema';
import { MailService }   from '../common/services/mail.service';

@Injectable()
export class EmployeesService {
  constructor(
      @InjectModel(Employee.name) private employeeModel: Model<EmployeeDocument>,
      @InjectModel('User')        private userModel:     Model<any>, // injection du modèle User
      private mailService: MailService,
  ) {}

  // ── Helper : génère un mot de passe temporaire ─────────────────────────────
  private generateTempPassword(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#!';
    return Array.from({ length: 12 }, () =>
        chars[Math.floor(Math.random() * chars.length)],
    ).join('');
  }

  // ── Helper : dérive un email unique si absent ──────────────────────────────
  private deriveEmail(dto: any, companyId: string): string {
    if (dto.email?.trim()) return dto.email.trim().toLowerCase();
    // Génère un email interne non-conflictuel : prenom.nom.XXXX@interne.local
    const slug = `${dto.firstName}.${dto.lastName}`
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // supprime les accents
        .replace(/[^a-z0-9.]/g, '');
    const suffix = companyId.slice(-4);
    return `${slug}.${suffix}@interne.local`;
  }

  // ── CREATE ─────────────────────────────────────────────────────────────────
  async create(dto: any, userId: string, userName: string, companyId: string) {
    // 1. Dériver l'email du compte à créer
    const accountEmail = this.deriveEmail(dto, companyId);

    // 2. Vérifier que cet email n'est pas déjà pris dans User
    const existingUser = await this.userModel.findOne({ email: accountEmail });
    if (existingUser) {
      throw new ConflictException(
          `Un compte existe déjà avec l'email "${accountEmail}". Modifiez l'email de l'employé.`,
      );
    }

    // 3. Générer un mot de passe temporaire et hasher
    const tempPassword = this.generateTempPassword();
    const hashed       = await bcrypt.hash(tempPassword, 12);

    // 4. Créer le compte User (rôle RESOURCE par défaut)
    const newUser = new this.userModel({
      name:               `${dto.firstName} ${dto.lastName}`,
      email:              accountEmail,
      password:           hashed,
      phone:              dto.phone || '',
      role:               UserRole.RESOURCE,
      companyId:          new Types.ObjectId(companyId),
      position:           dto.position || '',
      isActive:           dto.isActive ?? true,
      mustChangePassword: true, // l'employé devra changer son mdp à la 1ère connexion
    });
    const savedUser = await newUser.save();

    // 5. Créer l'employé avec le lien vers son compte
    const employee = new this.employeeModel({
      firstName:    dto.firstName,
      lastName:     dto.lastName,
      phone:        dto.phone,
      email:        accountEmail,    // email canonique (peut différer du dto si généré)
      position:     dto.position,
      department:   dto.department,
      contractType: dto.contractType || 'CDI',
      salary:       dto.salary       || 0,
      hireDate:     dto.hireDate     ? new Date(dto.hireDate) : undefined,
      cin:          dto.cin,
      cnss:         dto.cnss,
      rib:          dto.rib,
      isActive:     dto.isActive     ?? true,
      notes:        dto.notes        || '',
      userId:       savedUser._id,   // lien bidirectionnel
      companyId:    new Types.ObjectId(companyId),
      createdBy:    new Types.ObjectId(userId),
      createdByName: userName,
    });
    const savedEmployee = await employee.save();

    // 6. Envoyer l'email de bienvenue avec les identifiants
    try {
      await this.mailService.sendWelcomeEmail(
          accountEmail,
          `${dto.firstName} ${dto.lastName}`,
          tempPassword,
      );
    } catch {
      // L'envoi d'email ne doit pas bloquer la création — on log en silence
      console.warn(`[EmployeesService] Email de bienvenue non envoyé à ${accountEmail}`);
    }

    return {
      employee:  savedEmployee,
      account: {
        email:   accountEmail,
        role:    UserRole.RESOURCE,
        userId:  savedUser._id.toString(),
        message: 'Compte créé. Un email avec les identifiants a été envoyé.',
      },
    };
  }

  // ── FIND ALL ───────────────────────────────────────────────────────────────
  async findAll(companyId: string, query?: any) {
    const filter: any = { companyId: new Types.ObjectId(companyId) };

    if (query?.search) {
      filter.$or = [
        // FIX : firstName + lastName (anciennement "nom" — corrigé)
        { firstName: { $regex: query.search, $options: 'i' } },
        { lastName:  { $regex: query.search, $options: 'i' } },
        { position:  { $regex: query.search, $options: 'i' } },
        { email:     { $regex: query.search, $options: 'i' } },
      ];
    }

    return this.employeeModel.find(filter).sort({ lastName: 1, firstName: 1 }).exec();
  }

  // ── FIND ONE ───────────────────────────────────────────────────────────────
  async findOne(id: string, companyId: string) {
    const e = await this.employeeModel.findOne({
      _id:       new Types.ObjectId(id),
      companyId: new Types.ObjectId(companyId),
    }).populate('userId', 'email role isActive lastLoginAt'); // enrichit avec infos du compte

    if (!e) throw new NotFoundException('Employé introuvable');
    return e;
  }

  // ── UPDATE ─────────────────────────────────────────────────────────────────
  async update(id: string, companyId: string, dto: any) {
    // Sécurité : on ne laisse pas modifier companyId / createdBy / userId via le dto
    const { companyId: _c, createdBy: _cb, userId: _u, ...safeDto } = dto;

    const e = await this.employeeModel.findOneAndUpdate(
        { _id: new Types.ObjectId(id), companyId: new Types.ObjectId(companyId) },
        { $set: safeDto },
        { new: true },
    );
    if (!e) throw new NotFoundException('Employé introuvable');

    // Synchronise le nom et le statut sur le compte User associé
    if (e.userId) {
      const userUpdate: any = {};
      if (dto.firstName || dto.lastName) {
        const fresh = await this.employeeModel.findById(e._id).lean();
        userUpdate.name = `${fresh?.firstName || ''} ${fresh?.lastName || ''}`.trim();
      }
      if (dto.isActive !== undefined)  userUpdate.isActive  = dto.isActive;
      if (dto.position  !== undefined) userUpdate.position  = dto.position;
      if (Object.keys(userUpdate).length > 0) {
        await this.userModel.findByIdAndUpdate(e.userId, { $set: userUpdate });
      }
    }

    return e;
  }

  // ── REMOVE ─────────────────────────────────────────────────────────────────
  async remove(id: string, companyId: string) {
    // .lean<EmployeeDocument>() retourne un POJO typé — évite le problème ModifyResult
    const e = await this.employeeModel
        .findOneAndDelete({
          _id:       new Types.ObjectId(id),
          companyId: new Types.ObjectId(companyId),
        })
        .lean<EmployeeDocument>();

    if (!e) throw new NotFoundException('Employé introuvable');

    // Désactive le compte User associé (on ne supprime pas pour conserver l'historique)
    if (e.userId) {
      await this.userModel.findByIdAndUpdate(e.userId, {
        $set: { isActive: false },
      });
    }
  }

  // ── SALARY TOTAL ───────────────────────────────────────────────────────────
  async getSalaryTotal(companyId: string): Promise<number> {
    const result = await this.employeeModel.aggregate([
      { $match: { companyId: new Types.ObjectId(companyId), isActive: true } },
      { $group: { _id: null, total: { $sum: '$salary' } } },
    ]);
    return result[0]?.total || 0;
  }
}
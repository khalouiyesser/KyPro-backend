import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Charge, ChargeDocument } from './charge.schema';

@Injectable()
export class ChargesService {
  constructor(
      @InjectModel(Charge.name) private chargeModel: Model<ChargeDocument>,
  ) {}

  // ── CREATE ──────────────────────────────────────────────────────────────────
  async create(
      dto: any,
      userId: string,
      userName: string,
      companyId: string,
  ): Promise<ChargeDocument> {
    const charge = new this.chargeModel({
      ...dto,
      // Normalise les items : s'assurer que c'est un tableau
      items:     Array.isArray(dto.items) ? dto.items : [],
      currency:  dto.currency  ?? 'TND',
      isDevis:   dto.isDevis   ?? false,
      companyId: new Types.ObjectId(companyId),
      createdBy: new Types.ObjectId(userId),
      createdByName: userName,
    });
    return charge.save();
  }

  // ── FIND ALL ─────────────────────────────────────────────────────────────────
  async findAll(
      companyId: string,
      query?: {
        search?:    string;
        type?:      string;
        startDate?: string;
        endDate?:   string;
        sortBy?:    string;
        sortOrder?: 'asc' | 'desc';
      },
  ): Promise<ChargeDocument[]> {
    const filter: any = { companyId: new Types.ObjectId(companyId) };

    if (query?.search) {
      filter.$or = [
        { description: { $regex: query.search, $options: 'i' } },
        { source:      { $regex: query.search, $options: 'i' } },
      ];
    }
    if (query?.type) filter.type = query.type;

    if (query?.startDate || query?.endDate) {
      filter.date = {};
      if (query.startDate) filter.date.$gte = new Date(query.startDate);
      if (query.endDate)   filter.date.$lte = new Date(query.endDate);
    }

    const sort: any = query?.sortBy
        ? { [query.sortBy]: query.sortOrder === 'desc' ? -1 : 1 }
        : { date: -1 };

    return this.chargeModel.find(filter).sort(sort).exec();
  }

  // ── FIND ONE ─────────────────────────────────────────────────────────────────
  async findOne(id: string, companyId: string): Promise<ChargeDocument> {
    const c = await this.chargeModel.findOne({
      _id:       new Types.ObjectId(id),
      companyId: new Types.ObjectId(companyId),
    });
    if (!c) throw new NotFoundException('Charge introuvable');
    return c;
  }

  // ── UPDATE ───────────────────────────────────────────────────────────────────
  async update(
      id: string,
      companyId: string,
      dto: any,
      userId: string,
      userName: string,
  ): Promise<ChargeDocument> {
    const updateData: any = {
      ...dto,
      items:    Array.isArray(dto.items) ? dto.items : [],
      currency: dto.currency ?? 'TND',
      isDevis:  dto.isDevis  ?? false,
      updatedBy:       new Types.ObjectId(userId),
      updatedByName:   userName,
    };

    const c = await this.chargeModel.findOneAndUpdate(
        { _id: new Types.ObjectId(id), companyId: new Types.ObjectId(companyId) },
        updateData,
        { new: true },
    );
    if (!c) throw new NotFoundException('Charge introuvable');
    return c;
  }

  // ── REMOVE ───────────────────────────────────────────────────────────────────
  async remove(id: string, companyId: string): Promise<void> {
    const c = await this.chargeModel.findOneAndDelete({
      _id:       new Types.ObjectId(id),
      companyId: new Types.ObjectId(companyId),
    });
    if (!c) throw new NotFoundException('Charge introuvable');
  }
}
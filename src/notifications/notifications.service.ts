import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Notification, NotificationDocument } from './notification.schema';

@Injectable()
export class NotificationsService {
  constructor(@InjectModel(Notification.name) private notifModel: Model<NotificationDocument>) {}

  async create(dto: { title: string; message: string; type?: any; link?: string; companyId: string }): Promise<NotificationDocument> {
    const n = new this.notifModel({ ...dto, companyId: new Types.ObjectId(dto.companyId) });
    return n.save();
  }

  async findAll(companyId: string): Promise<NotificationDocument[]> {
    return this.notifModel.find({ companyId: new Types.ObjectId(companyId) }).sort({ createdAt: -1 }).limit(50).exec();
  }

  async markRead(id: string, companyId: string): Promise<NotificationDocument> {
    return this.notifModel.findOneAndUpdate({ _id: new Types.ObjectId(id), companyId: new Types.ObjectId(companyId) }, { isRead: true }, { new: true });
  }

  async markAllRead(companyId: string): Promise<void> {
    await this.notifModel.updateMany({ companyId: new Types.ObjectId(companyId) }, { isRead: true });
  }

  async getUnreadCount(companyId: string): Promise<number> {
    return this.notifModel.countDocuments({ companyId: new Types.ObjectId(companyId), isRead: false });
  }
  async delete(id: string, companyId: string): Promise<void> {
    await this.notifModel.deleteOne({ _id: new Types.ObjectId(id), companyId: new Types.ObjectId(companyId) });
  }
}

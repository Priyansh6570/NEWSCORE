import { Injectable, NotFoundException } from '@nestjs/common';
import { type Model, Types } from 'mongoose';
import { MongoService } from '../database/mongo.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { PLAN_MODEL, type PlanDoc } from './plan.schema';
import {
  type CreatePlanDto,
  type PlanView,
  type UpdatePlanDto,
} from './dto/monetisation.dto';

@Injectable()
export class PlanService {
  constructor(
    private readonly mongo: MongoService,
    private readonly ctx: TenantContextService,
  ) {}

  private model(): Model<PlanDoc> {
    return this.mongo.tenant(this.ctx.dbName).model<PlanDoc>(PLAN_MODEL);
  }

  /** Public pricing page: active plans only, cheapest first. */
  async listActive(): Promise<PlanView[]> {
    const docs = await this.model()
      .find({ isActive: true })
      .sort({ amount: 1 })
      .lean<PlanDoc[]>()
      .exec();
    return docs.map(toView);
  }

  async create(dto: CreatePlanDto): Promise<PlanView> {
    const doc = await this.model().create({
      name: dto.name,
      amount: dto.amount,
      currency: dto.currency ?? 'INR',
      interval: dto.interval,
      description: dto.description,
      isActive: dto.isActive ?? true,
    });
    return toView(doc.toObject());
  }

  async update(id: string, dto: UpdatePlanDto): Promise<PlanView> {
    const $set: Record<string, unknown> = {};
    if (dto.name !== undefined) $set.name = dto.name;
    if (dto.amount !== undefined) $set.amount = dto.amount;
    if (dto.currency !== undefined) $set.currency = dto.currency;
    if (dto.interval !== undefined) $set.interval = dto.interval;
    if (dto.description !== undefined) $set.description = dto.description;
    if (dto.isActive !== undefined) $set.isActive = dto.isActive;

    const updated = await this.model()
      .findByIdAndUpdate(this.objectId(id), { $set }, { new: true })
      .lean<PlanDoc>()
      .exec();
    if (!updated) throw new NotFoundException('Plan not found');
    return toView(updated);
  }

  async remove(id: string): Promise<void> {
    const res = await this.model().deleteOne({ _id: this.objectId(id) }).exec();
    if (res.deletedCount === 0) throw new NotFoundException('Plan not found');
  }

  /** Parse an id param, returning a 404 (not a 500) on a malformed id. */
  private objectId(id: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Plan not found');
    return new Types.ObjectId(id);
  }
}

/** Map a lean Plan document to the PlanView. */
function toView(doc: PlanDoc): PlanView {
  return {
    id: doc._id.toString(),
    name: doc.name,
    amount: doc.amount,
    currency: doc.currency,
    interval: doc.interval,
    description: doc.description,
    isActive: doc.isActive,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

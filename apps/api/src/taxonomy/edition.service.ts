import { Injectable, NotFoundException } from '@nestjs/common';
import { type Model, Types } from 'mongoose';
import { slugify, uniqueSlug } from '../common/slug';
import { MongoService } from '../database/mongo.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { EDITION_MODEL, type EditionDoc } from './edition.schema';
import {
  type CreateEditionDto,
  type EditionView,
  type UpdateEditionDto,
} from './dto/taxonomy.dto';

@Injectable()
export class EditionService {
  constructor(
    private readonly mongo: MongoService,
    private readonly ctx: TenantContextService,
  ) {}

  /** The Edition model on the active tenant's connection. */
  private model(): Model<EditionDoc> {
    return this.mongo.tenant(this.ctx.dbName).model<EditionDoc>(EDITION_MODEL);
  }

  async list(): Promise<EditionView[]> {
    const docs = await this.model().find().sort({ name: 1 }).lean<EditionDoc[]>().exec();
    return docs.map(toView);
  }

  /** Create an edition. slug derived from name, unique within the tenant. */
  async create(dto: CreateEditionDto): Promise<EditionView> {
    const slug = await uniqueSlug(this.model(), slugify(dto.name, 'edition'));
    const doc = await this.model().create({
      name: dto.name,
      slug,
      districtCode: dto.districtCode,
    });
    return toView(doc.toObject());
  }

  /** Rename / set district code. slug stays stable. */
  async update(id: string, dto: UpdateEditionDto): Promise<EditionView> {
    const updated = await this.model()
      .findByIdAndUpdate(this.objectId(id), { $set: dto }, { new: true })
      .lean<EditionDoc>()
      .exec();
    if (!updated) throw new NotFoundException('Edition not found');
    return toView(updated);
  }

  /**
   * Delete an edition. NOTE: does not yet block deletion when articles still
   * reference it — that referential cleanup lands with the admin module.
   */
  async remove(id: string): Promise<void> {
    const res = await this.model().deleteOne({ _id: this.objectId(id) }).exec();
    if (res.deletedCount === 0) throw new NotFoundException('Edition not found');
  }

  private objectId(id: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Edition not found');
    return new Types.ObjectId(id);
  }
}

function toView(doc: EditionDoc): EditionView {
  return {
    id: doc._id.toString(),
    name: doc.name,
    slug: doc.slug,
    districtCode: doc.districtCode,
  };
}

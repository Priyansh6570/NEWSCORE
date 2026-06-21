import { Injectable, NotFoundException } from '@nestjs/common';
import { type Model, Types } from 'mongoose';
import { slugify, uniqueSlug } from '../common/slug';
import { MongoService } from '../database/mongo.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { TAG_MODEL, type TagDoc } from './tag.schema';
import { type CreateTagDto, type TagView, type UpdateTagDto } from './dto/taxonomy.dto';

@Injectable()
export class TagService {
  constructor(
    private readonly mongo: MongoService,
    private readonly ctx: TenantContextService,
  ) {}

  /** The Tag model on the active tenant's connection. */
  private model(): Model<TagDoc> {
    return this.mongo.tenant(this.ctx.dbName).model<TagDoc>(TAG_MODEL);
  }

  async list(): Promise<TagView[]> {
    const docs = await this.model().find().sort({ name: 1 }).lean<TagDoc[]>().exec();
    return docs.map(toView);
  }

  /** Create a tag. slug derived from name, unique within the tenant. */
  async create(dto: CreateTagDto): Promise<TagView> {
    const slug = await uniqueSlug(this.model(), slugify(dto.name, 'tag'));
    const doc = await this.model().create({ name: dto.name, slug });
    return toView(doc.toObject());
  }

  /** Rename a tag. slug stays stable. */
  async update(id: string, dto: UpdateTagDto): Promise<TagView> {
    const updated = await this.model()
      .findByIdAndUpdate(this.objectId(id), { $set: dto }, { new: true })
      .lean<TagDoc>()
      .exec();
    if (!updated) throw new NotFoundException('Tag not found');
    return toView(updated);
  }

  /**
   * Delete a tag. NOTE: does not yet block deletion when articles still
   * reference it — that referential cleanup lands with the admin module.
   */
  async remove(id: string): Promise<void> {
    const res = await this.model().deleteOne({ _id: this.objectId(id) }).exec();
    if (res.deletedCount === 0) throw new NotFoundException('Tag not found');
  }

  private objectId(id: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Tag not found');
    return new Types.ObjectId(id);
  }
}

function toView(doc: TagDoc): TagView {
  return { id: doc._id.toString(), name: doc.name, slug: doc.slug };
}

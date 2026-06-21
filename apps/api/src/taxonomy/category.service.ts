import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { type Model, Types } from 'mongoose';
import { slugify, uniqueSlug } from '../common/slug';
import { MongoService } from '../database/mongo.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { CATEGORY_MODEL, type CategoryDoc } from './category.schema';
import {
  type CategoryView,
  type CreateCategoryDto,
  type UpdateCategoryDto,
} from './dto/taxonomy.dto';

@Injectable()
export class CategoryService {
  constructor(
    private readonly mongo: MongoService,
    private readonly ctx: TenantContextService,
  ) {}

  /** The Category model on the active tenant's connection. */
  private model(): Model<CategoryDoc> {
    return this.mongo.tenant(this.ctx.dbName).model<CategoryDoc>(CATEGORY_MODEL);
  }

  /** All categories (flat). The client builds the tree from parentId/order. */
  async list(): Promise<CategoryView[]> {
    const docs = await this.model().find().sort({ order: 1, name: 1 }).lean<CategoryDoc[]>().exec();
    return docs.map(toView);
  }

  /** Create a category. slug derived from name, unique within the tenant. */
  async create(dto: CreateCategoryDto): Promise<CategoryView> {
    const slug = await uniqueSlug(this.model(), slugify(dto.name, 'category'));
    const doc = await this.model().create({
      name: dto.name,
      slug,
      parentId: dto.parentId,
      order: dto.order ?? 0,
    });
    return toView(doc.toObject());
  }

  /**
   * Rename / reorder / reparent. slug stays stable. parentId: null reparents to
   * the top level. Self-parenting is rejected; deeper cycle checks land with the
   * referential cleanup in the admin module.
   */
  async update(id: string, dto: UpdateCategoryDto): Promise<CategoryView> {
    if (dto.parentId && dto.parentId === id) {
      throw new BadRequestException('A category cannot be its own parent');
    }
    const updated = await this.model()
      .findByIdAndUpdate(this.objectId(id), { $set: dto }, { new: true })
      .lean<CategoryDoc>()
      .exec();
    if (!updated) throw new NotFoundException('Category not found');
    return toView(updated);
  }

  /**
   * Delete a category. NOTE: does not yet block deletion when articles still
   * reference it — that referential cleanup lands with the admin module.
   */
  async remove(id: string): Promise<void> {
    const res = await this.model().deleteOne({ _id: this.objectId(id) }).exec();
    if (res.deletedCount === 0) throw new NotFoundException('Category not found');
  }

  private objectId(id: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Category not found');
    return new Types.ObjectId(id);
  }
}

function toView(doc: CategoryDoc): CategoryView {
  return {
    id: doc._id.toString(),
    name: doc.name,
    slug: doc.slug,
    parentId: doc.parentId?.toString(),
    order: doc.order,
  };
}

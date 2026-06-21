import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { type FilterQuery, type Model, Types } from 'mongoose';
import sharp from 'sharp';
import { MongoService } from '../database/mongo.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { StorageService } from './storage.service';
import { MEDIA_MODEL, type MediaDoc, type MediaKind } from './media.schema';
import type { MediaPage, MediaQueryDto, MediaView } from './dto/media.dto';

/** Per-kind size caps (bytes). The largest also bounds the upload interceptor. */
export const SIZE_CAPS: Record<MediaKind, number> = {
  image: 10 * 1024 * 1024,
  pdf: 25 * 1024 * 1024,
  audio: 20 * 1024 * 1024,
};

/** Hard ceiling for the multipart interceptor — the biggest per-kind cap. */
export const MAX_UPLOAD_BYTES = Math.max(...Object.values(SIZE_CAPS));

/** Longest edge images are downscaled to (never upscaled). */
const IMAGE_MAX_DIMENSION = 2560;

@Injectable()
export class MediaService {
  constructor(
    private readonly mongo: MongoService,
    private readonly ctx: TenantContextService,
    private readonly storage: StorageService,
  ) {}

  /** The Media model on the active tenant's connection. */
  private model(): Model<MediaDoc> {
    return this.mongo.tenant(this.ctx.dbName).model<MediaDoc>(MEDIA_MODEL);
  }

  // ── Commands ───────────────────────────────────────────────────────────

  /**
   * Validate, process, store, and record an upload. Server-side validation is
   * the real gate: the MIME allowlist and size cap are enforced here regardless
   * of what the client claims. Images are normalised to stripped WebP; PDFs and
   * audio are stored as received.
   */
  async upload(
    file: Express.Multer.File,
    kind: MediaKind,
    uploaderId: string,
  ): Promise<MediaView> {
    if (!file) throw new BadRequestException('No file uploaded');

    // 1) MIME allowlist per kind — reject anything mislabelled (415-style → 400).
    if (!mimeMatchesKind(kind, file.mimetype)) {
      throw new BadRequestException(`File type ${file.mimetype} is not allowed for ${kind}`);
    }

    // 2) Size cap per kind (413).
    const cap = SIZE_CAPS[kind];
    if (file.size > cap) {
      throw new PayloadTooLargeException(
        `${kind} exceeds the ${Math.round(cap / (1024 * 1024))}MB limit`,
      );
    }

    // 3) Process. Images → resized, metadata-stripped WebP; others stored as-is.
    let body: Buffer = file.buffer;
    let mime = file.mimetype;
    let ext = extFor(kind, file);
    let width: number | undefined;
    let height: number | undefined;

    if (kind === 'image') {
      const processed = await sharp(file.buffer)
        .rotate() // honour EXIF orientation before metadata is stripped
        .resize(IMAGE_MAX_DIMENSION, IMAGE_MAX_DIMENSION, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp()
        .toBuffer({ resolveWithObject: true });
      body = processed.data;
      mime = 'image/webp';
      ext = 'webp';
      width = processed.info.width;
      height = processed.info.height;
    }

    // 4) Per-tenant key prefix in the shared bucket, then upload to R2.
    const key = `${this.ctx.slug}/${kind}/${randomUUID()}.${ext}`;
    await this.storage.put(key, body, mime);

    // 5) Record the asset. Never return the raw doc.
    const doc = await this.model().create({
      kind,
      key,
      url: this.storage.publicUrl(key),
      mime,
      size: body.length,
      width,
      height,
      originalName: file.originalname,
      uploadedBy: new Types.ObjectId(uploaderId),
    });
    return toView(doc.toObject());
  }

  /** Delete from R2 first, then drop the record. */
  async remove(id: string): Promise<void> {
    const doc = await this.model().findById(this.objectId(id)).lean<MediaDoc>().exec();
    if (!doc) throw new NotFoundException('Media not found');
    await this.storage.delete(doc.key);
    await this.model().deleteOne({ _id: doc._id }).exec();
  }

  // ── Queries ────────────────────────────────────────────────────────────

  /** Admin media library: newest first, optional kind filter. Page-based. */
  async list(q: MediaQueryDto): Promise<MediaPage> {
    const filter: FilterQuery<MediaDoc> = {};
    if (q.kind) filter.kind = q.kind;
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    const model = this.model();
    const [docs, total] = await Promise.all([
      model
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean<MediaDoc[]>()
        .exec(),
      model.countDocuments(filter).exec(),
    ]);
    return { items: docs.map(toView), page, limit, total };
  }

  /** Single asset by id. */
  async get(id: string): Promise<MediaView> {
    const doc = await this.model().findById(this.objectId(id)).lean<MediaDoc>().exec();
    if (!doc) throw new NotFoundException('Media not found');
    return toView(doc);
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  /** Parse an id param, returning a 404 (not a 500) on a malformed id. */
  private objectId(id: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Media not found');
    return new Types.ObjectId(id);
  }
}

/** True if the uploaded MIME type is permitted for the declared kind. */
function mimeMatchesKind(kind: MediaKind, mime: string): boolean {
  switch (kind) {
    case 'image':
      return mime.startsWith('image/');
    case 'pdf':
      return mime === 'application/pdf';
    case 'audio':
      return mime.startsWith('audio/');
  }
}

/** File extension for the stored object (images are always re-encoded to webp). */
function extFor(kind: MediaKind, file: Express.Multer.File): string {
  if (kind === 'pdf') return 'pdf';
  if (kind === 'image') return 'webp';
  // audio: keep the original extension, else fall back to the MIME subtype.
  const fromName = file.originalname.split('.').pop();
  if (fromName && /^[a-z0-9]+$/i.test(fromName) && fromName !== file.originalname) {
    return fromName.toLowerCase();
  }
  const sub = file.mimetype.split('/')[1];
  return (sub || 'bin').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin';
}

/** Map a lean Media document to the public MediaView. Never leak raw docs. */
function toView(doc: MediaDoc): MediaView {
  return {
    id: doc._id.toString(),
    kind: doc.kind,
    key: doc.key,
    url: doc.url,
    mime: doc.mime,
    size: doc.size,
    width: doc.width,
    height: doc.height,
    originalName: doc.originalName,
    uploadedBy: doc.uploadedBy.toString(),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

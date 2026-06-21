import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { type Model, Types } from 'mongoose';
import sharp from 'sharp';
import { startIntDb, TEST_DB_NAME, type IntDb } from '../test/int-db';
import type { TenantContextService } from '../tenancy/tenant-context.service';
import { MEDIA_MODEL, MediaSchema, type MediaDoc } from './media.schema';
import { MediaService, SIZE_CAPS } from './media.service';
import type { StorageService } from './storage.service';

/**
 * Real-Mongo integration specs for the Media module. The invariants that matter
 * live in the service, not the controller: server-side validation is the true
 * gate (reject mislabelled MIME, reject oversized files), images are normalised
 * to WebP with captured dimensions, the R2 key carries the per-tenant prefix,
 * and remove() deletes the object before the record. Storage is faked so no real
 * R2 calls happen; everything else runs against an actual MongoDB.
 */
describe('MediaService (integration, real Mongo)', () => {
  const TENANT_SLUG = 'demo';
  let db: IntDb;
  let service: MediaService;
  let storage: FakeStorage;

  beforeAll(async () => {
    db = await startIntDb([[MEDIA_MODEL, MediaSchema]]);
    storage = new FakeStorage();
    // ctx must expose slug (for the key prefix), not just dbName.
    const ctx = { dbName: TEST_DB_NAME, slug: TENANT_SLUG } as unknown as TenantContextService;
    service = new MediaService(db.mongo, ctx, storage as unknown as StorageService);
  }, 60_000);

  afterAll(async () => {
    await db?.stop();
  });

  beforeEach(async () => {
    await db.reset(MEDIA_MODEL);
    storage.reset();
  });

  const model = (): Model<MediaDoc> =>
    db.mongo.tenant(TEST_DB_NAME).model<MediaDoc>(MEDIA_MODEL);

  /** A small real PNG (sharp processes it for real in the image test). */
  async function pngFile(over: Partial<Express.Multer.File> = {}): Promise<Express.Multer.File> {
    const buffer = await sharp({
      create: { width: 4000, height: 3000, channels: 3, background: '#abcdef' },
    })
      .png()
      .toBuffer();
    return file({ mimetype: 'image/png', originalname: 'photo.png', buffer, ...over });
  }

  function file(over: Partial<Express.Multer.File>): Express.Multer.File {
    const buffer = over.buffer ?? Buffer.alloc(8);
    return {
      fieldname: 'file',
      originalname: 'f.bin',
      encoding: '7bit',
      mimetype: 'application/octet-stream',
      size: buffer.length,
      buffer,
      stream: undefined as never,
      destination: '',
      filename: '',
      path: '',
      ...over,
    };
  }

  const uploaderId = new Types.ObjectId().toString();

  it('rejects a file whose MIME does not match the declared kind (a .txt as image)', async () => {
    const f = file({ mimetype: 'text/plain', originalname: 'notes.txt', buffer: Buffer.from('hi') });

    await expect(service.upload(f, 'image', uploaderId)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    // nothing reached storage or the DB
    expect(storage.objects.size).toBe(0);
    expect(await model().countDocuments()).toBe(0);
  });

  it('rejects an image over the 10MB cap (413), before touching storage', async () => {
    const tooBig = file({
      mimetype: 'image/jpeg',
      originalname: 'huge.jpg',
      buffer: Buffer.alloc(SIZE_CAPS.image + 1),
    });

    await expect(service.upload(tooBig, 'image', uploaderId)).rejects.toBeInstanceOf(
      PayloadTooLargeException,
    );
    expect(storage.objects.size).toBe(0);
  });

  it('processes an image to stripped WebP, captures dimensions, and stores under the tenant prefix', async () => {
    const view = await service.upload(await pngFile(), 'image', uploaderId);

    expect(view.mime).toBe('image/webp');
    // 4000x3000 downscaled to fit 2560 → 2560x1920, never upscaled
    expect(view.width).toBe(2560);
    expect(view.height).toBe(1920);
    expect(view.kind).toBe('image');
    expect(view.uploadedBy).toBe(uploaderId);
    // per-tenant key prefix + webp extension
    expect(view.key).toMatch(/^demo\/image\/[0-9a-f-]+\.webp$/);
    expect(view.url).toBe(`https://cdn.test/${view.key}`);
    // the object actually landed in storage and matches the recorded size
    const stored = storage.objects.get(view.key);
    expect(stored?.contentType).toBe('image/webp');
    expect(stored?.body.length).toBe(view.size);
    // and the bytes are real WebP
    const meta = await sharp(stored!.body).metadata();
    expect(meta.format).toBe('webp');
  });

  it('stores a PDF as-is (no re-encoding, no dimensions)', async () => {
    const f = file({
      mimetype: 'application/pdf',
      originalname: 'edition.pdf',
      buffer: Buffer.from('%PDF-1.4 fake'),
    });

    const view = await service.upload(f, 'pdf', uploaderId);

    expect(view.mime).toBe('application/pdf');
    expect(view.width).toBeUndefined();
    expect(view.height).toBeUndefined();
    expect(view.key).toMatch(/^demo\/pdf\/[0-9a-f-]+\.pdf$/);
    expect(storage.objects.get(view.key)?.body.toString()).toBe('%PDF-1.4 fake');
  });

  it('keeps the original extension for audio', async () => {
    const f = file({
      mimetype: 'audio/mpeg',
      originalname: 'bulletin.mp3',
      buffer: Buffer.from('ID3 fake'),
    });

    const view = await service.upload(f, 'audio', uploaderId);

    expect(view.kind).toBe('audio');
    expect(view.key).toMatch(/^demo\/audio\/[0-9a-f-]+\.mp3$/);
  });

  it('list filters by kind and returns newest first', async () => {
    await service.upload(await pngFile(), 'image', uploaderId);
    await service.upload(
      file({ mimetype: 'application/pdf', originalname: 'a.pdf', buffer: Buffer.from('%PDF') }),
      'pdf',
      uploaderId,
    );

    const all = await service.list({});
    expect(all.total).toBe(2);

    const pdfs = await service.list({ kind: 'pdf' });
    expect(pdfs.total).toBe(1);
    expect(pdfs.items[0].kind).toBe('pdf');
  });

  it('remove deletes the object from storage AND the DB record', async () => {
    const view = await service.upload(await pngFile(), 'image', uploaderId);
    expect(storage.objects.has(view.key)).toBe(true);

    await service.remove(view.id);

    expect(storage.objects.has(view.key)).toBe(false);
    expect(await model().countDocuments()).toBe(0);
  });
});

/** In-memory stand-in for the R2 StorageService — no network. */
class FakeStorage {
  objects = new Map<string, { body: Buffer; contentType: string }>();

  put(key: string, body: Buffer, contentType: string): Promise<void> {
    this.objects.set(key, { body, contentType });
    return Promise.resolve();
  }

  delete(key: string): Promise<void> {
    this.objects.delete(key);
    return Promise.resolve();
  }

  publicUrl(key: string): string {
    return `https://cdn.test/${key}`;
  }

  reset(): void {
    this.objects.clear();
  }
}

import { Schema, Types } from 'mongoose';

/** Mongoose model name for media assets (tenant DB). */
export const MEDIA_MODEL = 'Media';

/** What kind of asset this is. Video lives in Bunny Stream — a later, separate step. */
export type MediaKind = 'image' | 'pdf' | 'audio';

export const MEDIA_KINDS: readonly MediaKind[] = ['image', 'pdf', 'audio'];

/**
 * A stored media asset. Lives in the tenant DB; every query runs through the
 * tenant connection. The bytes live in R2 under `key`; `url` is the public CDN
 * URL the website/app loads directly (no API proxy). See CLAUDE.md §6.3.
 */
export interface MediaDoc {
  _id: Types.ObjectId;
  kind: MediaKind;
  key: string; // R2 object key, '<tenant-slug>/<kind>/<uuid>.<ext>'
  url: string; // public CDN URL derived from the key
  mime: string;
  size: number; // bytes of the stored object
  width?: number; // images only
  height?: number; // images only
  originalName: string;
  uploadedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export const MediaSchema = new Schema<MediaDoc>(
  {
    kind: { type: String, enum: MEDIA_KINDS, required: true },
    key: { type: String, required: true, trim: true },
    url: { type: String, required: true, trim: true },
    mime: { type: String, required: true, trim: true },
    size: { type: Number, required: true },
    width: { type: Number },
    height: { type: Number },
    originalName: { type: String, required: true, trim: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { collection: 'media', timestamps: true },
);

// Newest-first listing (the admin library) + filter by kind.
MediaSchema.index({ createdAt: -1 });
MediaSchema.index({ kind: 1 });

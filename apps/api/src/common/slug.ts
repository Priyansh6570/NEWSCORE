import type { Model } from 'mongoose';

/**
 * Slugify a name: lowercase, alphanumerics to hyphens, trimmed. Non-Latin input
 * (e.g. Hindi) can reduce to empty — callers pass a fallback stub.
 */
export function slugify(input: string, fallback = 'item'): string {
  const slug = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
}

/**
 * Find a free slug for the given tenant-scoped model, appending -2, -3… until
 * one is unused. The collection's unique index is the real guard; this just
 * avoids the obvious collision. Pass the model from the active tenant connection.
 */
export async function uniqueSlug<T extends { slug: string }>(
  model: Model<T>,
  base: string,
): Promise<string> {
  let candidate = base;
  let n = 2;
  while (await model.exists({ slug: candidate })) {
    candidate = `${base}-${n++}`;
  }
  return candidate;
}

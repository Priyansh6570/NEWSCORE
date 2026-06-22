// apps/api/src/content/article.search-text.ts
//
// Derives the flat, searchable text for an article from its title, excerpt, and
// the plaintext of its body blocks. This feeds the Atlas Search index only — it is
// NEVER part of any view. Kept pure (no Mongoose) so it's reusable by the
// create/update path AND the ensure-search-index backfill script, and unit-testable.

/**
 * Recursively collect the text of every block in a rich-content body. Handles both
 * shapes we store: TipTap (`{ type:'text', text:'…' }` nodes) and the simpler
 * `{ blocks:[{ text:'…' }] }` form — anything with a string `text` property, at
 * any depth, is gathered.
 */
export function flattenBlocksText(body: unknown): string {
  const out: string[] = [];
  const walk = (node: unknown): void => {
    if (node == null) return;
    if (Array.isArray(node)) {
      for (const child of node) walk(child);
      return;
    }
    if (typeof node === 'object') {
      for (const [key, value] of Object.entries(node)) {
        if (key === 'text' && typeof value === 'string') out.push(value);
        else walk(value);
      }
    }
  };
  walk(body);
  return out.join(' ');
}

/** Build the index fuel: title + excerpt + flattened body text, space-joined. */
export function buildSearchText(article: {
  title?: string;
  excerpt?: string;
  body?: unknown;
}): string {
  return [article.title, article.excerpt, flattenBlocksText(article.body)]
    .filter((s): s is string => typeof s === 'string' && s.length > 0)
    .join(' ')
    .trim();
}

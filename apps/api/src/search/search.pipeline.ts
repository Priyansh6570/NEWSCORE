import type { PipelineStage } from 'mongoose';

/** Atlas Search index name — one per tenant DB, created by ensure-search-index. */
export const SEARCH_INDEX = 'default';
/** Fields the fuzzy clause searches across (all mapped as strings in the index). */
export const SEARCH_PATHS = ['title', 'excerpt', 'searchText'] as const;

export const DEFAULT_SEARCH_LIMIT = 10;
export const MAX_SEARCH_LIMIT = 50;

/** Default to 10, floor at 1, cap at 50. */
export function clampSearchLimit(limit?: number): number {
  if (!limit || limit < 1) return DEFAULT_SEARCH_LIMIT;
  return Math.min(limit, MAX_SEARCH_LIMIT);
}

export interface SearchPipelineOpts {
  page: number;
  limit: number;
  now: Date;
}

/**
 * Build the tenant-scoped published-article search pipeline. $search MUST be the
 * first stage (Atlas Search requirement); a fuzzy `should` over title/excerpt/
 * searchText plus a title-boosted clause (minimumShouldMatch 1) gives relevance
 * ordering by score. We then keep only live published articles, paginate, and
 * project a BODY-FREE shape (drop body + the internal searchText) — results are
 * always body-free, premium or not. Pure: no DB handle, so it's unit-testable.
 */
export function buildSearchPipeline(q: string, opts: SearchPipelineOpts): PipelineStage[] {
  return [
    {
      $search: {
        index: SEARCH_INDEX,
        compound: {
          should: [
            // Fuzzy match across all searchable fields (typo-tolerant, 1 edit).
            { text: { query: q, path: [...SEARCH_PATHS], fuzzy: { maxEdits: 1 } } },
            // Boost title hits so a headline match outranks a body-only match.
            { text: { query: q, path: 'title', score: { boost: { value: 3 } } } },
          ],
          minimumShouldMatch: 1,
        },
      },
    },
    // Search runs over the whole collection; restrict to live published articles.
    { $match: { status: 'published', publishedAt: { $lte: opts.now } } },
    { $skip: (opts.page - 1) * opts.limit },
    { $limit: opts.limit },
    // Body never leaves the server here; searchText is internal index fuel.
    { $project: { body: 0, searchText: 0 } },
  ];
}

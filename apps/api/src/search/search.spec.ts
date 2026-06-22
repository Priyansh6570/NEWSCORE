import type { PipelineStage } from 'mongoose';
import { buildSearchText, flattenBlocksText } from '../content/article.search-text';
import {
  buildSearchPipeline,
  clampSearchLimit,
  SEARCH_INDEX,
} from './search.pipeline';

/**
 * Pure/unit coverage for search — memory-server has NO $search, so the live query
 * is exercised only in the manual smoke test. Here we pin the pieces that are pure
 * logic: searchText flattening, the $search pipeline shape, and the limit cap.
 */
describe('search (pure units)', () => {
  describe('buildSearchText', () => {
    it('flattens TipTap-style nested text nodes', () => {
      const body = {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'hello' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'world' }] },
        ],
      };
      expect(flattenBlocksText(body)).toBe('hello world');
    });

    it('flattens the simpler { blocks:[{text}] } shape', () => {
      const body = { blocks: [{ type: 'paragraph', text: 'first' }, { type: 'paragraph', text: 'second' }] };
      expect(flattenBlocksText(body)).toBe('first second');
    });

    it('concatenates title + excerpt + body text, skipping empties', () => {
      const text = buildSearchText({
        title: 'Headline',
        excerpt: 'A teaser',
        body: { blocks: [{ text: 'body copy' }] },
      });
      expect(text).toBe('Headline A teaser body copy');
    });

    it('handles a missing/empty body without crashing', () => {
      expect(buildSearchText({ title: 'Only Title' })).toBe('Only Title');
      expect(buildSearchText({ body: {} })).toBe('');
    });
  });

  describe('buildSearchPipeline', () => {
    const now = new Date('2026-06-22T00:00:00.000Z');
    const stages = buildSearchPipeline('cricket', { page: 2, limit: 10, now });
    const byKey = (k: string): PipelineStage | undefined =>
      stages.find((s) => Object.prototype.hasOwnProperty.call(s, k));

    it('puts $search first with the default index', () => {
      const first = stages[0] as { $search?: { index?: string } };
      expect(first.$search?.index).toBe(SEARCH_INDEX);
    });

    it('is a fuzzy should over title/excerpt/searchText plus a title boost, minShould 1', () => {
      const search = (stages[0] as { $search: { compound: Record<string, unknown> } }).$search;
      const compound = search.compound as {
        should: Array<{ text: { path: unknown; fuzzy?: { maxEdits: number }; score?: unknown } }>;
        minimumShouldMatch: number;
      };
      expect(compound.minimumShouldMatch).toBe(1);
      expect(compound.should).toHaveLength(2);

      const fuzzy = compound.should[0]!.text;
      expect(fuzzy.path).toEqual(['title', 'excerpt', 'searchText']);
      expect(fuzzy.fuzzy).toEqual({ maxEdits: 1 });

      const boost = compound.should[1]!.text;
      expect(boost.path).toBe('title');
      expect(boost.score).toEqual({ boost: { value: 3 } });
    });

    it('restricts to live published articles after $search', () => {
      const match = byKey('$match') as { $match: Record<string, unknown> };
      expect(match.$match).toEqual({ status: 'published', publishedAt: { $lte: now } });
    });

    it('projects a BODY-FREE shape (drops body and internal searchText)', () => {
      const project = byKey('$project') as { $project: Record<string, number> };
      expect(project.$project).toEqual({ body: 0, searchText: 0 });
    });

    it('paginates: $skip = (page-1)*limit and $limit = limit', () => {
      const skip = byKey('$skip') as { $skip: number };
      const limit = byKey('$limit') as { $limit: number };
      expect(skip.$skip).toBe(10); // (2 - 1) * 10
      expect(limit.$limit).toBe(10);
    });
  });

  describe('clampSearchLimit', () => {
    it('defaults to 10, floors at 1, caps at 50', () => {
      expect(clampSearchLimit(undefined)).toBe(10);
      expect(clampSearchLimit(0)).toBe(10);
      expect(clampSearchLimit(5)).toBe(5);
      expect(clampSearchLimit(50)).toBe(50);
      expect(clampSearchLimit(100)).toBe(50);
    });
  });
});

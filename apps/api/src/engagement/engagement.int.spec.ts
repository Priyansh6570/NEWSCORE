import { type Model, Types } from 'mongoose';
import { ARTICLE_MODEL, ArticleSchema, type ArticleDoc } from '../content/article.schema';
import { startIntDb, TEST_DB_NAME, type IntDb } from '../test/int-db';
import { USER_MODEL, UserSchema, type UserDoc } from '../users/user.schema';
import { CommentService } from './comment.service';
import { COMMENT_MODEL, CommentSchema, type CommentDoc } from './comment.schema';
import { ReactionService } from './reaction.service';
import { REACTION_MODEL, ReactionSchema, type ReactionDoc } from './reaction.schema';

/**
 * Real-Mongo integration specs for the two engagement invariants worth pinning:
 *  1. a PENDING comment never leaks into the public read (the moderation
 *     visibility guarantee — the comment-side twin of "a draft never leaks"); and
 *  2. liking is idempotent — two likes from one user yield a count of 1, backed
 *     by the unique (articleId,userId) index. Run against an actual MongoDB so the
 *     query/index semantics are the real ones, not a mock that could agree with a bug.
 */
describe('Engagement (integration, real Mongo)', () => {
  let db: IntDb;
  let comments: CommentService;
  let reactions: ReactionService;

  beforeAll(async () => {
    db = await startIntDb([
      [ARTICLE_MODEL, ArticleSchema],
      [USER_MODEL, UserSchema],
      [COMMENT_MODEL, CommentSchema],
      [REACTION_MODEL, ReactionSchema],
    ]);
    comments = new CommentService(db.mongo, db.ctx);
    reactions = new ReactionService(db.mongo, db.ctx);
  }, 60_000);

  afterAll(async () => {
    await db?.stop();
  });

  beforeEach(async () => {
    await db.reset(ARTICLE_MODEL);
    await db.reset(USER_MODEL);
    await db.reset(COMMENT_MODEL);
    await db.reset(REACTION_MODEL);
  });

  const articleModel = (): Model<ArticleDoc> =>
    db.mongo.tenant(TEST_DB_NAME).model<ArticleDoc>(ARTICLE_MODEL);
  const commentModel = (): Model<CommentDoc> =>
    db.mongo.tenant(TEST_DB_NAME).model<CommentDoc>(COMMENT_MODEL);
  const reactionModel = (): Model<ReactionDoc> =>
    db.mongo.tenant(TEST_DB_NAME).model<ReactionDoc>(REACTION_MODEL);

  async function seedArticle(): Promise<ArticleDoc> {
    return articleModel().create({
      title: 'A Story',
      slug: 'a-story',
      body: {},
      status: 'published',
      publishedAt: new Date(Date.now() - 1000),
      authorId: new Types.ObjectId(),
    });
  }

  async function seedReader(): Promise<UserDoc> {
    return (await db.mongo
      .tenant(TEST_DB_NAME)
      .model<UserDoc>(USER_MODEL)
      .create({ name: 'Jane Reader', phone: '+15550009999', roleIds: [], status: 'active' })) as UserDoc;
  }

  // ── Invariant 1: pre-moderation visibility ────────────────────────────────

  describe('comment moderation visibility', () => {
    it('a pending comment never appears in the public read; approving reveals it', async () => {
      const article = await seedArticle();
      const reader = await seedReader();

      const created = await comments.create(
        article._id.toString(),
        { body: 'First!' },
        reader._id.toString(),
      );
      expect(created.status).toBe('pending');
      // denormalized author name is snapshotted, body is stored verbatim
      expect(created.authorName).toBe('Jane Reader');

      // Public read sees nothing while it is pending.
      const before = await comments.listPublic(article._id.toString(), {});
      expect(before.total).toBe(0);
      expect(before.items).toEqual([]);

      // Approve → now visible.
      await comments.approve(created.id);
      const after = await comments.listPublic(article._id.toString(), {});
      expect(after.total).toBe(1);
      expect(after.items[0]!.body).toBe('First!');
      expect(after.items[0]!.status).toBe('approved');
    });

    it('rejected comments also stay out of the public read', async () => {
      const article = await seedArticle();
      const reader = await seedReader();
      const created = await comments.create(
        article._id.toString(),
        { body: 'spam' },
        reader._id.toString(),
      );

      await comments.reject(created.id);

      const pub = await comments.listPublic(article._id.toString(), {});
      expect(pub.total).toBe(0);
    });

    it('nests approved replies under their top-level comment, excluding pending replies', async () => {
      const article = await seedArticle();
      const reader = await seedReader();
      const top = await comments.create(
        article._id.toString(),
        { body: 'parent' },
        reader._id.toString(),
      );
      await comments.approve(top.id);

      const approvedReply = await comments.create(
        article._id.toString(),
        { body: 'approved reply', parentId: top.id },
        reader._id.toString(),
      );
      await comments.approve(approvedReply.id);
      // a second reply left pending must not surface
      await comments.create(
        article._id.toString(),
        { body: 'pending reply', parentId: top.id },
        reader._id.toString(),
      );

      const pub = await comments.listPublic(article._id.toString(), {});
      expect(pub.total).toBe(1); // one top-level thread
      expect(pub.items[0]!.replies).toHaveLength(1);
      expect(pub.items[0]!.replies![0]!.body).toBe('approved reply');
    });

    it('rejects posting a comment to an article that does not exist in this tenant', async () => {
      const reader = await seedReader();
      await expect(
        comments.create(new Types.ObjectId().toString(), { body: 'hi' }, reader._id.toString()),
      ).rejects.toThrow(/Article not found/);
    });
  });

  // ── Invariant 2: idempotent likes ─────────────────────────────────────────

  describe('reactions (idempotent likes)', () => {
    it('two likes from one user yield a count of 1; unlike returns to 0', async () => {
      const article = await seedArticle();
      const userId = new Types.ObjectId().toString();

      const first = await reactions.like(article._id.toString(), userId);
      expect(first.likeCount).toBe(1);

      // Liking again is a no-op — still 1, and only one reaction record exists.
      const second = await reactions.like(article._id.toString(), userId);
      expect(second.likeCount).toBe(1);
      expect(await reactionModel().countDocuments({ articleId: article._id }).exec()).toBe(1);

      // The denormalized count on the article matches.
      const fresh = await articleModel().findById(article._id).lean<ArticleDoc>().exec();
      expect(fresh?.likeCount).toBe(1);

      // Unlike → 0, and never below 0 on a repeated unlike.
      expect((await reactions.unlike(article._id.toString(), userId)).likeCount).toBe(0);
      expect((await reactions.unlike(article._id.toString(), userId)).likeCount).toBe(0);
    });

    it('distinct users each add 1 to the count', async () => {
      const article = await seedArticle();
      await reactions.like(article._id.toString(), new Types.ObjectId().toString());
      const second = await reactions.like(article._id.toString(), new Types.ObjectId().toString());
      expect(second.likeCount).toBe(2);
    });
  });
});

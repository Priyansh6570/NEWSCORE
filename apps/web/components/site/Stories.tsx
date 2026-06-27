import type { HomeContent, StoryItem } from '../../lib/content/home';

/** A single hairline-ruled story (no card). Faithful to home-A's `.story`. */
function Story({ story, leadIn, withMedia }: { story: StoryItem; leadIn?: boolean; withMedia?: boolean }) {
  const initial = story.author.trim().charAt(0);
  return (
    <article className={`story size-${story.size}${leadIn ? ' lead-in' : ''}`}>
      {withMedia ? <div className="st-media ph" /> : null}
      <span className="tag">{story.category}</span>
      <h3 className="st-h">{story.title}</h3>
      {story.dek ? <p>{story.dek}</p> : null}
      <div className="byline">
        {story.size === 'xl' || story.size === 'l' ? <span className="av">{initial}</span> : null}
        <span className="nm">{story.author}</span>
        {story.role ? (
          <>
            <span className="dot-sep" />
            <span className="ro">{story.role}</span>
          </>
        ) : null}
        {story.readTime ? (
          <>
            <span className="dot-sep" />
            <span className="mt">{story.readTime}</span>
          </>
        ) : null}
        {story.views ? (
          <>
            <span className="dot-sep" />
            <span className="mt">{story.views}</span>
          </>
        ) : null}
      </div>
    </article>
  );
}

/**
 * The typographic story grid — three hairline-ruled columns, matching home-A's
 * `.stories`. Purely presentational; content is passed in (mock now, backend
 * next phase). This is the minimal "few story rows" proof surface.
 */
export function Stories({ content }: { content: HomeContent }) {
  const [s1, s2, s3, s4, s5, s6] = content.stories;
  return (
    <>
      <div className="divider">
        <h2>{content.todayLabel}</h2>
      </div>
      <section className="stories">
        <div className="col">
          {s1 ? <Story story={s1} leadIn withMedia /> : null}
          {s5 ? <Story story={s5} /> : null}
        </div>
        <div className="col ruled">
          {s2 ? <Story story={s2} leadIn /> : null}
          {s3 ? <Story story={s3} withMedia /> : null}
        </div>
        <div className="col ruled">
          {s4 ? <Story story={s4} leadIn withMedia /> : null}
          {s6 ? <Story story={s6} /> : null}
        </div>
      </section>
    </>
  );
}

import { resolveOrigin } from './request-origin.decorator';

/**
 * The origin feeds absolute URLs into cached, crawler-facing sitemaps/feeds, so a
 * forged Host / X-Forwarded-Host must never be reflected. resolveOrigin accepts
 * the request host ONLY when it is one of the tenant's known domains, else falls
 * back to the canonical domain over https.
 */
describe('resolveOrigin (SEO host validation)', () => {
  const domains = ['clienta.com', 'www.clienta.com'];

  it('accepts a known host and honours the forwarded proto', () => {
    expect(
      resolveOrigin({ xForwardedHost: 'clienta.com', xForwardedProto: 'https', domains }),
    ).toBe('https://clienta.com');
  });

  it('keeps the port for a known host (dev reachability)', () => {
    expect(resolveOrigin({ host: 'clienta.com:8080', protocol: 'http', domains })).toBe(
      'http://clienta.com:8080',
    );
  });

  it('FALLS BACK to the canonical domain when the host is forged (cache-poisoning guard)', () => {
    expect(
      resolveOrigin({ xForwardedHost: 'evil.attacker.test', protocol: 'http', domains }),
    ).toBe('https://clienta.com');
  });

  it('ignores a forged X-Forwarded-Host even when Host is legit, preferring validation', () => {
    // x-forwarded-host wins precedence but is not a known domain → canonical fallback.
    expect(
      resolveOrigin({ xForwardedHost: 'evil.test', host: 'clienta.com', domains }),
    ).toBe('https://clienta.com');
  });

  it('matches the domain case-insensitively', () => {
    expect(resolveOrigin({ host: 'WWW.ClientA.com', protocol: 'https', domains })).toBe(
      'https://www.clienta.com',
    );
  });

  it('falls back to the first listed domain as canonical', () => {
    expect(resolveOrigin({ host: 'nope.test', domains: ['apex.com', 'm.apex.com'] })).toBe(
      'https://apex.com',
    );
  });
});

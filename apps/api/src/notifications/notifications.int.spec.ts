import { Logger, ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema';
import type { DecryptedSms } from '../site-config/dto/site-config.dto';
import type { SiteConfigService } from '../site-config/site-config.service';
import { NotificationsService } from './notifications.service';

/**
 * The notifications delivery router (CLAUDE.md §13 — OTP must never leak). HARD
 * RULES, one test each:
 *   - SMS configured        → MSG91 real delivery (fetch with the tenant's
 *     template_id/mobile/otp); the otp NEVER appears in a log line.
 *   - not configured + prod → throws ServiceUnavailable; the console provider is
 *     NOT called, so the otp is never logged.
 *   - not configured + dev  → dev console path (no throw), so local/demo login works.
 */
describe('NotificationsService.sendOtp (delivery router)', () => {
  const OTP = '654321';
  const PHONE = '+91 98123-45678';
  const SMS: DecryptedSms = {
    provider: 'msg91',
    authKey: 'tenant-auth-key',
    senderId: 'NEWSCO',
    otpTemplateId: 'tmpl_demo_1',
  };

  let fetchMock: jest.Mock;
  let logged: string[];
  let originalFetch: typeof globalThis.fetch;

  function build(opts: { sms: DecryptedSms | null; env: Env['NODE_ENV'] }): NotificationsService {
    const siteConfig = {
      getDecryptedSms: jest.fn().mockResolvedValue(opts.sms),
    } as unknown as SiteConfigService;
    const config = {
      get: jest.fn().mockReturnValue(opts.env),
    } as unknown as ConfigService<Env, true>;
    return new NotificationsService(siteConfig, config);
  }

  const otpEverLogged = (): boolean => logged.some((line) => line.includes(OTP));

  beforeEach(() => {
    logged = [];
    fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 } as Response);
    originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
    // Capture every log line so we can assert the otp never appears in one.
    for (const level of ['log', 'warn', 'error', 'debug', 'verbose'] as const) {
      jest
        .spyOn(Logger.prototype, level)
        .mockImplementation((...args: unknown[]) => logged.push(args.map(String).join(' ')));
    }
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('configured → calls MSG91 with template_id/mobile/otp, and never logs the otp', async () => {
    const svc = build({ sms: SMS, env: 'production' });
    await svc.sendOtp(PHONE, OTP);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('template_id=tmpl_demo_1');
    expect(url).toContain('mobile=919812345678'); // normalised: digits only, no '+'
    expect(url).toContain(`otp=${OTP}`);
    expect((init.headers as Record<string, string>).authkey).toBe('tenant-auth-key');

    // The otp went over the wire to MSG91, but never into a log line.
    expect(otpEverLogged()).toBe(false);
  });

  it('not configured + production → throws, never console-falls-back, never logs the otp', async () => {
    const svc = build({ sms: null, env: 'production' });

    await expect(svc.sendOtp(PHONE, OTP)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(otpEverLogged()).toBe(false);
  });

  it('not configured + development → dev console path, no throw (local/demo login works)', async () => {
    const svc = build({ sms: null, env: 'development' });

    await expect(svc.sendOtp(PHONE, OTP)).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
    // The dev console path intentionally surfaces the code locally.
    expect(otpEverLogged()).toBe(true);
  });

  it('configured but missing otpTemplateId → treated as not configured', async () => {
    const svc = build({ sms: { ...SMS, otpTemplateId: '' }, env: 'production' });
    await expect(svc.sendOtp(PHONE, OTP)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

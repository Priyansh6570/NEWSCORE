import type { ConfigService } from '@nestjs/config';
import { EncryptionService } from './encryption.service';

/** A ConfigService stub returning a fixed SECRETS_ENC_KEY. */
function makeService(key = 'unit-test-secrets-enc-key-0123456789'): EncryptionService {
  const config = { get: () => key } as unknown as ConfigService<Record<string, unknown>, true>;
  return new EncryptionService(config as never);
}

describe('EncryptionService (AES-256-GCM)', () => {
  it('round-trips plaintext through encrypt → decrypt', () => {
    const enc = makeService();
    const secret = 'rzp_live_SUPERSECRET_value';

    const payload = enc.encrypt(secret);
    expect(payload).not.toContain(secret); // ciphertext, not plaintext
    expect(payload.split('.')).toHaveLength(3); // iv.tag.ciphertext
    expect(enc.decrypt(payload)).toBe(secret);
  });

  it('produces a different ciphertext each time (random IV)', () => {
    const enc = makeService();
    expect(enc.encrypt('same')).not.toBe(enc.encrypt('same'));
  });

  it('rejects a tampered ciphertext (GCM auth tag mismatch)', () => {
    const enc = makeService();
    const [iv, tag, ct] = enc.encrypt('secret').split('.');
    const flipped = ct[0] === 'A' ? 'B' : 'A';
    const tampered = `${iv}.${tag}.${flipped}${ct.slice(1)}`;

    expect(() => enc.decrypt(tampered)).toThrow();
  });

  it('cannot decrypt with a different key', () => {
    const payload = makeService('key-aaaaaaaaaaaaaaaaaaaa').encrypt('secret');
    expect(() => makeService('key-bbbbbbbbbbbbbbbbbbbb').decrypt(payload)).toThrow();
  });

  it('throws on malformed input', () => {
    expect(() => makeService().decrypt('not-a-valid-payload')).toThrow('Malformed ciphertext');
  });
});

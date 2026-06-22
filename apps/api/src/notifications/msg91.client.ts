// apps/api/src/notifications/msg91.client.ts
//
// Direct REST to MSG91, no SDK — mirrors razorpay.client.ts. Credentials are the
// PER-TENANT MSG91 config pulled (decrypted) from SiteConfig; they are never read
// from env. The OTP is NEVER put in a log line or a thrown error message.
//
// NOTE: the exact v5 OTP field placement should be confirmed against MSG91's
// current docs — it only matters once a tenant has registered DLT, so minor drift
// here is low-stakes until then (the demo stays on the dev console path).
import type { DecryptedSms } from '../site-config/dto/site-config.dto';

const MSG91_OTP_URL = 'https://control.msg91.com/api/v5/otp';

/** MSG91's mobile format is country-code digits with no leading '+'. */
export function normalizeMsg91Mobile(phone: string): string {
  return phone.replace(/[^\d]/g, '');
}

/**
 * Send an OTP via MSG91 using the tenant's DLT-approved template + sender. Throws
 * on a non-2xx — WITHOUT the otp in the message (only the status code).
 */
export async function sendOtpViaMsg91(
  cfg: DecryptedSms,
  phone: string,
  otp: string,
): Promise<void> {
  const mobile = normalizeMsg91Mobile(phone);
  const url =
    `${MSG91_OTP_URL}?template_id=${encodeURIComponent(cfg.otpTemplateId)}` +
    `&mobile=${encodeURIComponent(mobile)}` +
    `&otp=${encodeURIComponent(otp)}` +
    (cfg.senderId ? `&sender=${encodeURIComponent(cfg.senderId)}` : '');

  const res = await fetch(url, {
    method: 'POST',
    headers: { authkey: cfg.authKey, 'content-type': 'application/json' },
  });

  if (!res.ok) {
    // Status only — never the otp, never the authkey.
    throw new Error(`MSG91 OTP send failed: ${res.status}`);
  }
}

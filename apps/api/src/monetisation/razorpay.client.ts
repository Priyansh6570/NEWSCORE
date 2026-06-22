// apps/api/src/monetisation/razorpay.client.ts
//
// We talk to Razorpay over its REST API directly rather than via the official SDK.
// Order creation is a single authenticated POST and webhook verification is plain
// node:crypto, so the SDK would add a CommonJS dependency for no real gain — the
// task explicitly allows this fallback. Credentials are the PER-TENANT keys pulled
// (decrypted) from SiteConfig; they are never read from env and never logged.
import { createHmac, timingSafeEqual } from 'node:crypto';

const RAZORPAY_API = 'https://api.razorpay.com/v1';

export interface RazorpayCreds {
  keyId: string;
  keySecret: string;
}

export interface CreateOrderInput {
  amount: number; // paise — taken from the plan, never the client
  currency: string; // e.g. 'INR'
  receipt: string; // our reference (the subscriber id)
  notes?: Record<string, string>;
}

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  status: string;
}

/**
 * Create a Razorpay order with the tenant's keys via HTTP Basic auth
 * (keyId:keySecret). Throws on a non-2xx so checkout fails loudly rather than
 * recording a subscriber against a non-existent order.
 */
export async function createRazorpayOrder(
  creds: RazorpayCreds,
  input: CreateOrderInput,
): Promise<RazorpayOrder> {
  const auth = Buffer.from(`${creds.keyId}:${creds.keySecret}`).toString('base64');
  const res = await fetch(`${RAZORPAY_API}/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: input.amount,
      currency: input.currency,
      receipt: input.receipt,
      notes: input.notes,
      payment_capture: 1,
    }),
  });

  if (!res.ok) {
    // Surface Razorpay's error message but never the credentials.
    const detail = await res.text().catch(() => '');
    throw new Error(`Razorpay order creation failed (${res.status}): ${detail}`);
  }
  return (await res.json()) as RazorpayOrder;
}

/**
 * Razorpay signs webhooks with HMAC-SHA256 over the RAW body, keyed by the
 * tenant's webhook secret. Verify BEFORE trusting anything in the payload.
 * Length-guarded and timing-safe.
 */
export function verifyRazorpaySignature(
  rawBody: Buffer,
  signature: string | undefined,
  webhookSecret: string,
): boolean {
  const expected = createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature ?? '', 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

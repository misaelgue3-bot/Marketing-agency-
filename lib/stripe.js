/**
 * Stripe — monthly subscription payments for the plans.
 *
 * Setup (see README):
 *   1. Create an account at stripe.com and copy the Secret key.
 *   2. Set STRIPE_SECRET_KEY in the environment (sk_live_... / sk_test_...).
 *   3. For automatic payment tracking, add a webhook endpoint in the Stripe
 *      dashboard pointing at POST /api/stripe/webhook and set its signing
 *      secret as STRIPE_WEBHOOK_SECRET (whsec_...).
 *
 * Prices come straight from the admin Settings at checkout time, so no
 * products need to be configured in the Stripe dashboard. Uses the plain
 * REST API over fetch — no extra dependency.
 */

const crypto = require('crypto');

const available = () => Boolean(process.env.STRIPE_SECRET_KEY);
const webhookReady = () => Boolean(process.env.STRIPE_WEBHOOK_SECRET);

/** Flattens nested params into Stripe's form encoding: line_items[0][price_data][currency]=usd */
function encodeForm(obj, prefix = '', out = new URLSearchParams()) {
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (typeof value === 'object') encodeForm(value, name, out);
    else out.append(name, String(value));
  }
  return out;
}

async function api(path, params) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: encodeForm(params).toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Stripe ${path} failed: ${(data.error && data.error.message) || res.status}`);
  }
  return data;
}

/** Creates a hosted Checkout Session for a monthly subscription. Returns { url, id }. */
async function createSubscriptionCheckout({ plan, amountUsd, customerEmail, metadata = {}, successUrl, cancelUrl }) {
  return api('checkout/sessions', {
    mode: 'subscription',
    success_url: successUrl,
    cancel_url: cancelUrl,
    allow_promotion_codes: 'true',
    ...(customerEmail ? { customer_email: customerEmail } : {}),
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'usd',
        unit_amount: Math.round(Number(amountUsd) * 100),
        recurring: { interval: 'month' },
        product_data: { name: `Plan ${plan} — Your LocalLift` },
      },
    }],
    metadata,
    subscription_data: { metadata },
  });
}

/**
 * Verifies a webhook's Stripe-Signature header (t=...,v1=...):
 * expected = HMAC_SHA256(`${t}.${rawBody}`, STRIPE_WEBHOOK_SECRET).
 * Returns the parsed event, or null when the signature is invalid/stale.
 */
function verifyWebhook(rawBody, sigHeader) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !rawBody || !sigHeader) return null;

  let t = '';
  const v1s = [];
  for (const part of String(sigHeader).split(',')) {
    const [k, v] = part.split('=');
    if (k === 't') t = v;
    else if (k === 'v1') v1s.push(v);
  }
  if (!t || !v1s.length) return null;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 5 * 60) return null; // replay protection

  const expected = crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  const valid = v1s.some(
    (v) => v && v.length === expected.length && crypto.timingSafeEqual(Buffer.from(v), Buffer.from(expected))
  );
  if (!valid) return null;

  try { return JSON.parse(rawBody); } catch { return null; }
}

module.exports = { available, webhookReady, createSubscriptionCheckout, verifyWebhook };

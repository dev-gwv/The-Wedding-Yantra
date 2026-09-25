import { createHmac, timingSafeEqual } from "node:crypto";

/** Starts a subscription with the payment provider and says where the owner pays. */
export interface PaymentGateway {
  createSubscription(input: { planId: string; totalCount: number; notes: Record<string, string> }): Promise<{ id: string; url: string }>;
}

/** Razorpay Subscriptions over its REST API. */
export function razorpayGateway(keys: { keyId: string; keySecret: string }, fetchImpl: typeof fetch = fetch): PaymentGateway {
  const auth = `Basic ${Buffer.from(`${keys.keyId}:${keys.keySecret}`).toString("base64")}`;
  return {
    async createSubscription({ planId, totalCount, notes }) {
      const res = await fetchImpl("https://api.razorpay.com/v1/subscriptions", {
        method: "POST",
        headers: { authorization: auth, "content-type": "application/json" },
        body: JSON.stringify({ plan_id: planId, total_count: totalCount, quantity: 1, customer_notify: 1, notes }),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; short_url?: string; error?: { description?: string } };
      if (!res.ok || !body.id || !body.short_url) {
        throw new Error(`Razorpay didn't start the subscription: ${body.error?.description ?? res.status}`);
      }
      return { id: body.id, url: body.short_url };
    },
  };
}

/** Razorpay signs each webhook: HMAC-SHA256 of the raw body with the webhook secret, in hex. */
export function validRazorpaySignature(rawBody: string, signature: string | undefined, secret: string): boolean {
  if (!signature) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(rawBody).digest("hex"));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

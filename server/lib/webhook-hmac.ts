import { createHmac, timingSafeEqual } from "crypto";

/**
 * F-189 fix: Verify aggregator webhook HMAC-SHA256 signature.
 * Uses timing-safe comparison to prevent timing attacks.
 *
 * NOTE: The HMAC is computed over the provided body string, not raw
 * pre-parse bytes. If an aggregator signs the raw HTTP body, callers
 * must pass the raw bytes, not JSON.stringify(req.body).
 * See F-189-FU for follow-up verification against each aggregator's docs.
 */
export function verifyAggregatorHmac(
  rawBody: string,
  signature: string,
  secret: string
): boolean {
  if (!signature || !secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const sigBuf = Buffer.from(signature, "hex");
  const expectedBuf = Buffer.from(expected, "hex");
  if (sigBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(sigBuf, expectedBuf);
}

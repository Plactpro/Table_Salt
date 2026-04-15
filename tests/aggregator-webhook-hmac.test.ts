import { describe, it, expect } from "vitest";
import { createHmac } from "crypto";
import { verifyAggregatorHmac } from "../server/lib/webhook-hmac";

/**
 * F-189: Aggregator webhook HMAC signature validation.
 *
 * Tests the verifyAggregatorHmac function exported from
 * server/routers/channels.ts, which guards
 * POST /api/aggregator/webhook/:platform against unauthenticated
 * order injection.
 */

describe("F-189: Aggregator webhook HMAC verification", () => {
  const SECRET = "test-webhook-secret-abc123";
  const BODY = JSON.stringify({ order_id: "ORD-001", items: [{ name: "Burger", qty: 1 }] });

  function signPayload(body: string, secret: string): string {
    return createHmac("sha256", secret).update(body).digest("hex");
  }

  it("rejects requests with no signature (empty string)", () => {
    expect(verifyAggregatorHmac(BODY, "", SECRET)).toBe(false);
  });

  it("rejects requests with an invalid/forged signature", () => {
    const badSig = createHmac("sha256", "wrong-secret").update(BODY).digest("hex");
    expect(verifyAggregatorHmac(BODY, badSig, SECRET)).toBe(false);
  });

  it("rejects requests when secret is empty (unconfigured channel)", () => {
    const sig = signPayload(BODY, SECRET);
    expect(verifyAggregatorHmac(BODY, sig, "")).toBe(false);
  });

  it("accepts requests with a valid HMAC signature", () => {
    const validSig = signPayload(BODY, SECRET);
    expect(verifyAggregatorHmac(BODY, validSig, SECRET)).toBe(true);
  });

  it("rejects when body is tampered after signing", () => {
    const validSig = signPayload(BODY, SECRET);
    const tamperedBody = JSON.stringify({ order_id: "ORD-001", items: [{ name: "Burger", qty: 999 }] });
    expect(verifyAggregatorHmac(tamperedBody, validSig, SECRET)).toBe(false);
  });

  it("rejects non-hex signature gracefully (no crash)", () => {
    expect(verifyAggregatorHmac(BODY, "not-a-hex-signature", SECRET)).toBe(false);
  });

  it("rejects signature with correct HMAC but different secret", () => {
    const sig = signPayload(BODY, "different-tenant-secret");
    expect(verifyAggregatorHmac(BODY, sig, SECRET)).toBe(false);
  });
});

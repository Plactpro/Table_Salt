import { describe, it, expect } from "vitest";

/**
 * F-023: PATCH /api/tenant must NOT allow owners to set system-managed
 * fields like `plan`, `subscriptionStatus`, `stripeCustomerId`, etc.
 *
 * These fields are managed exclusively by Stripe webhooks (billing.ts)
 * and super-admin routes (admin-routes.ts).
 */

// Import the allowlist and filter function from tenant.ts
// (will be added by the fix — these imports will fail until then)
import { OWNER_EDITABLE_FIELDS, filterOwnerEditable } from "../server/lib/tenant-fields";

describe("F-023: Tenant PATCH field allowlist", () => {

  describe("OWNER_EDITABLE_FIELDS constant", () => {
    it("allows legitimate self-service fields", () => {
      const expected = [
        "name", "address", "timezone", "timeFormat",
        "taxRate", "taxType", "compoundTax", "serviceCharge",
        "gstin", "cgstRate", "sgstRate", "invoicePrefix",
        "currency", "currencyPosition", "currencyDecimals",
        "businessType", "razorpayEnabled", "razorpayKeyId", "razorpayKeySecret",
      ];
      for (const field of expected) {
        expect(OWNER_EDITABLE_FIELDS.has(field)).toBe(true);
      }
    });

    it("blocks plan (billing-managed)", () => {
      expect(OWNER_EDITABLE_FIELDS.has("plan")).toBe(false);
    });

    it("blocks subscriptionStatus (billing-managed)", () => {
      expect(OWNER_EDITABLE_FIELDS.has("subscriptionStatus")).toBe(false);
    });

    it("blocks stripeCustomerId (Stripe webhook-managed)", () => {
      expect(OWNER_EDITABLE_FIELDS.has("stripeCustomerId")).toBe(false);
    });

    it("blocks stripeSubscriptionId (Stripe webhook-managed)", () => {
      expect(OWNER_EDITABLE_FIELDS.has("stripeSubscriptionId")).toBe(false);
    });

    it("blocks trialEndsAt (system-managed)", () => {
      expect(OWNER_EDITABLE_FIELDS.has("trialEndsAt")).toBe(false);
    });
  });

  describe("filterOwnerEditable()", () => {
    it("passes through allowed fields", () => {
      const input = { name: "New Name", timezone: "Asia/Dubai" };
      expect(filterOwnerEditable(input)).toEqual({ name: "New Name", timezone: "Asia/Dubai" });
    });

    it("strips plan from request body", () => {
      const input = { name: "New Name", plan: "enterprise" };
      const result = filterOwnerEditable(input);
      expect(result).toEqual({ name: "New Name" });
      expect(result).not.toHaveProperty("plan");
    });

    it("strips subscriptionStatus from request body", () => {
      const input = { name: "New Name", subscriptionStatus: "active" };
      const result = filterOwnerEditable(input);
      expect(result).toEqual({ name: "New Name" });
      expect(result).not.toHaveProperty("subscriptionStatus");
    });

    it("strips multiple blocked fields while preserving allowed ones", () => {
      const input = {
        name: "Legit Update",
        plan: "premium",
        subscriptionStatus: "active",
        stripeCustomerId: "cus_fake",
        taxRate: "5",
        currency: "AED",
      };
      const result = filterOwnerEditable(input);
      expect(result).toEqual({ name: "Legit Update", taxRate: "5", currency: "AED" });
    });

    it("returns empty object when all fields are blocked", () => {
      const input = { plan: "enterprise", subscriptionStatus: "active", trialEndsAt: "2099-01-01" };
      expect(filterOwnerEditable(input)).toEqual({});
    });

    it("skips undefined values even for allowed fields", () => {
      const input = { name: "Test", address: undefined, plan: "premium" };
      const result = filterOwnerEditable(input);
      expect(result).toEqual({ name: "Test" });
      expect(result).not.toHaveProperty("address");
      expect(result).not.toHaveProperty("plan");
    });
  });
});

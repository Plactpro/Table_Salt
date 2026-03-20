import { describe, it, expect, beforeAll } from "vitest";
import { can, needsSupervisorApproval } from "../server/permissions";
import { isValidCidr, isIpInCidr } from "../server/security";
import { encryptField, decryptField, isEncrypted } from "../server/encryption";

const owner = { id: "u1", role: "owner", tenantId: "t1" };
const manager = { id: "u2", role: "manager", tenantId: "t1" };
const waiter = { id: "u3", role: "waiter", tenantId: "t1" };
const kitchen = { id: "u4", role: "kitchen", tenantId: "t1" };
const accountant = { id: "u5", role: "accountant", tenantId: "t1" };
const customer = { id: "u6", role: "customer", tenantId: "t1" };
const unknown = { id: "u7", role: "ghost_role", tenantId: "t1" };

describe("can() — role-based permission checks", () => {
  it("owner can create orders", () => {
    expect(can(owner, "create_order")).toBe(true);
  });

  it("owner can void orders", () => {
    expect(can(owner, "void_order")).toBe(true);
  });

  it("owner can manage billing", () => {
    expect(can(owner, "manage_billing")).toBe(true);
  });

  it("owner can manage security", () => {
    expect(can(owner, "manage_security")).toBe(true);
  });

  it("manager can create orders", () => {
    expect(can(manager, "create_order")).toBe(true);
  });

  it("manager can void orders", () => {
    expect(can(manager, "void_order")).toBe(true);
  });

  it("manager cannot manage billing", () => {
    expect(can(manager, "manage_billing")).toBe(false);
  });

  it("manager cannot manage security", () => {
    expect(can(manager, "manage_security")).toBe(false);
  });

  it("waiter can create orders", () => {
    expect(can(waiter, "create_order")).toBe(true);
  });

  it("waiter cannot void orders", () => {
    expect(can(waiter, "void_order")).toBe(false);
  });

  it("waiter cannot view reports", () => {
    expect(can(waiter, "view_reports")).toBe(false);
  });

  it("waiter cannot manage billing", () => {
    expect(can(waiter, "manage_billing")).toBe(false);
  });

  it("kitchen can edit orders", () => {
    expect(can(kitchen, "edit_order")).toBe(true);
  });

  it("kitchen cannot create orders directly", () => {
    expect(can(kitchen, "create_order")).toBe(false);
  });

  it("kitchen cannot void orders", () => {
    expect(can(kitchen, "void_order")).toBe(false);
  });

  it("accountant can view reports", () => {
    expect(can(accountant, "view_reports")).toBe(true);
  });

  it("accountant can view audit log", () => {
    expect(can(accountant, "view_audit_log")).toBe(true);
  });

  it("accountant cannot create orders", () => {
    expect(can(accountant, "create_order")).toBe(false);
  });

  it("customer has no permissions", () => {
    expect(can(customer, "create_order")).toBe(false);
    expect(can(customer, "view_reports")).toBe(false);
  });

  it("unknown role returns false for any action", () => {
    expect(can(unknown, "create_order")).toBe(false);
    expect(can(unknown, "manage_billing")).toBe(false);
  });
});

describe("needsSupervisorApproval()", () => {
  it("void_order is a supervisor-required action for waiter", () => {
    expect(needsSupervisorApproval(waiter, "void_order")).toBe(true);
  });

  it("void_order does not require supervisor approval for owner (they already have permission)", () => {
    expect(needsSupervisorApproval(owner, "void_order")).toBe(false);
  });

  it("apply_large_discount requires supervisor for waiter", () => {
    expect(needsSupervisorApproval(waiter, "apply_large_discount")).toBe(true);
  });

  it("create_order does not require supervisor for anyone", () => {
    expect(needsSupervisorApproval(waiter, "create_order")).toBe(false);
    expect(needsSupervisorApproval(kitchen, "create_order")).toBe(false);
  });
});

describe("isValidCidr()", () => {
  it("accepts a valid /24 CIDR", () => {
    expect(isValidCidr("192.168.1.0/24")).toBe(true);
  });

  it("accepts a valid /8 CIDR", () => {
    expect(isValidCidr("10.0.0.0/8")).toBe(true);
  });

  it("accepts a /0 CIDR (all traffic)", () => {
    expect(isValidCidr("0.0.0.0/0")).toBe(true);
  });

  it("accepts a /32 host CIDR", () => {
    expect(isValidCidr("192.168.1.1/32")).toBe(true);
  });

  it("accepts a bare IP as valid CIDR (no prefix)", () => {
    expect(isValidCidr("10.10.10.10")).toBe(true);
  });

  it("rejects an out-of-range octet", () => {
    expect(isValidCidr("999.0.0.1/24")).toBe(false);
  });

  it("rejects a prefix > 32", () => {
    expect(isValidCidr("192.168.1.0/33")).toBe(false);
  });

  it("rejects plain text", () => {
    expect(isValidCidr("not-an-ip")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidCidr("")).toBe(false);
  });
});

describe("isIpInCidr()", () => {
  it("IP within /24 returns true", () => {
    expect(isIpInCidr("192.168.1.100", "192.168.1.0/24")).toBe(true);
  });

  it("IP from different /24 returns false", () => {
    expect(isIpInCidr("192.168.2.1", "192.168.1.0/24")).toBe(false);
  });

  it("IP within /8 returns true", () => {
    expect(isIpInCidr("10.5.5.5", "10.0.0.0/8")).toBe(true);
  });

  it("IP outside /8 returns false", () => {
    expect(isIpInCidr("11.0.0.1", "10.0.0.0/8")).toBe(false);
  });

  it("exact match on /32 returns true", () => {
    expect(isIpInCidr("192.168.1.1", "192.168.1.1/32")).toBe(true);
  });

  it("different IP on /32 returns false", () => {
    expect(isIpInCidr("192.168.1.2", "192.168.1.1/32")).toBe(false);
  });

  it("any IP is in 0.0.0.0/0", () => {
    expect(isIpInCidr("8.8.8.8", "0.0.0.0/0")).toBe(true);
    expect(isIpInCidr("203.0.113.1", "0.0.0.0/0")).toBe(true);
  });

  it("invalid CIDR returns false", () => {
    expect(isIpInCidr("192.168.1.1", "bad-cidr")).toBe(false);
  });
});

describe("encryptField() / decryptField() / isEncrypted()", () => {
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = "test-secret-key-for-unit-tests-only";
  });

  it("encrypts a string and the result starts with 'enc:'", () => {
    const ciphertext = encryptField("hello@example.com");
    expect(ciphertext).toMatch(/^enc:/);
  });

  it("round-trips: encrypt then decrypt returns original", () => {
    const plaintext = "sensitive-data-123";
    const ciphertext = encryptField(plaintext);
    expect(decryptField(ciphertext)).toBe(plaintext);
  });

  it("round-trips with unicode text", () => {
    const plaintext = "Crêpe & café — 你好";
    const ciphertext = encryptField(plaintext);
    expect(decryptField(ciphertext)).toBe(plaintext);
  });

  it("each encryption produces a different ciphertext (randomized IV)", () => {
    const a = encryptField("same-value");
    const b = encryptField("same-value");
    expect(a).not.toBe(b);
    expect(decryptField(a)).toBe("same-value");
    expect(decryptField(b)).toBe("same-value");
  });

  it("isEncrypted returns true for enc: prefixed strings", () => {
    const ciphertext = encryptField("test");
    expect(isEncrypted(ciphertext)).toBe(true);
  });

  it("isEncrypted returns false for plain strings", () => {
    expect(isEncrypted("hello")).toBe(false);
    expect(isEncrypted("user@example.com")).toBe(false);
  });

  it("isEncrypted returns false for null/undefined", () => {
    expect(isEncrypted(null)).toBe(false);
    expect(isEncrypted(undefined)).toBe(false);
  });

  it("decryptField returns the input unchanged for non-encrypted strings", () => {
    expect(decryptField("plain-text")).toBe("plain-text");
    expect(decryptField("user@example.com")).toBe("user@example.com");
  });

  it("encryptField passes through empty string", () => {
    expect(encryptField("")).toBe("");
  });
});

describe("Food cost percentage (pure math)", () => {
  const foodCostPct = (cost: number, price: number) =>
    price > 0 ? (cost / price) * 100 : 0;

  it("zero cost gives 0%", () => {
    expect(foodCostPct(0, 10)).toBe(0);
  });

  it("cost equals price gives 100%", () => {
    expect(foodCostPct(10, 10)).toBe(100);
  });

  it("calculates 30% correctly", () => {
    expect(foodCostPct(3, 10)).toBeCloseTo(30);
  });

  it("calculates a fractional percentage", () => {
    expect(foodCostPct(1.5, 12)).toBeCloseTo(12.5);
  });

  it("zero price guard returns 0", () => {
    expect(foodCostPct(5, 0)).toBe(0);
  });

  it("above 100% is technically possible (loss scenario)", () => {
    expect(foodCostPct(15, 10)).toBe(150);
  });
});

describe("Recipe cost calculation (pure math)", () => {
  const calcRecipeCost = (
    ingredients: Array<{ quantity: number; costPerUnit: number; wastePct?: number }>
  ) =>
    ingredients.reduce((total, ing) => {
      const qty = ing.quantity / (1 - (ing.wastePct ?? 0) / 100);
      return total + qty * ing.costPerUnit;
    }, 0);

  it("single ingredient, no waste", () => {
    expect(calcRecipeCost([{ quantity: 200, costPerUnit: 0.01 }])).toBeCloseTo(2.0);
  });

  it("multiple ingredients sum correctly", () => {
    const cost = calcRecipeCost([
      { quantity: 100, costPerUnit: 0.02 },
      { quantity: 50, costPerUnit: 0.04 },
    ]);
    expect(cost).toBeCloseTo(4.0);
  });

  it("applies waste percentage correctly", () => {
    const cost = calcRecipeCost([{ quantity: 100, costPerUnit: 1, wastePct: 20 }]);
    expect(cost).toBeCloseTo(125);
  });

  it("zero quantity yields zero cost", () => {
    expect(calcRecipeCost([{ quantity: 0, costPerUnit: 5 }])).toBe(0);
  });

  it("empty ingredient list yields zero", () => {
    expect(calcRecipeCost([])).toBe(0);
  });

  it("100% waste would be infinite — guard: wastePct capped at <100", () => {
    const calc = () => calcRecipeCost([{ quantity: 100, costPerUnit: 1, wastePct: 99 }]);
    expect(calc()).toBeCloseTo(10000);
  });
});

import { describe, it, expect } from "vitest";
import { recalculateBillTotals, type TenantTaxConfig, type BillLineItem } from "../server/lib/bill-recalc";

/**
 * F-121: Server-side bill total recalculation.
 * F-213: Loyalty tier discount neutralized (client discountAmount ignored).
 * F-120: GST default inconsistency fixed (uses order-creation formula).
 */

const UAE_TENANT: TenantTaxConfig = {
  taxRate: "5",
  taxType: "vat",
  compoundTax: false,
  serviceCharge: "10",
  currency: "AED",
};

const INDIA_GST_TENANT: TenantTaxConfig = {
  taxRate: "18",
  taxType: "gst",
  compoundTax: false,
  serviceCharge: "0",
  currency: "INR",
  cgstRate: "9",
  sgstRate: "9",
};

const ITEMS: BillLineItem[] = [
  { price: "50.00", quantity: 2 },   // 100
  { price: "25.50", quantity: 1 },   // 25.50
];
// subtotal = 125.50

describe("F-121: recalculateBillTotals", () => {

  it("computes correct totals for UAE VAT tenant", () => {
    const r = recalculateBillTotals(ITEMS, 0, UAE_TENANT);
    expect(r.subtotal).toBe(125.50);
    expect(r.discount).toBe(0);
    // service charge: 125.50 * 10% = 12.55
    expect(r.serviceCharge).toBe(12.55);
    // tax: 125.50 * 5% = 6.275 → 6.28
    expect(r.tax).toBe(6.28);
    // total: 125.50 + 12.55 + 6.28 = 144.33
    expect(r.total).toBe(144.33);
    expect(r.isGST).toBe(false);
    expect(r.cgstAmount).toBeNull();
  });

  it("computes correct totals for India GST tenant with CGST/SGST split", () => {
    const r = recalculateBillTotals(ITEMS, 0, INDIA_GST_TENANT);
    expect(r.subtotal).toBe(125.50);
    // tax: 125.50 * 18% = 22.59
    expect(r.tax).toBe(22.59);
    expect(r.isGST).toBe(true);
    // CGST = 22.59 * 9/18 = 11.295 → 11.30
    expect(r.cgstAmount).toBe(11.30);
    // SGST = 22.59 - 11.30 = 11.29
    expect(r.sgstAmount).toBe(11.29);
    // Verify CGST + SGST = total tax
    expect(r.cgstAmount! + r.sgstAmount!).toBe(r.tax);
    expect(r.taxBreakdown).not.toBeNull();
  });

  it("applies discount from order (ignores client discount)", () => {
    // Server discount = 20 (from order creation)
    const r = recalculateBillTotals(ITEMS, 20, UAE_TENANT);
    expect(r.subtotal).toBe(125.50);
    expect(r.discount).toBe(20);
    // afterDiscount = 105.50
    // serviceCharge = 105.50 * 10% = 10.55
    expect(r.serviceCharge).toBe(10.55);
    // tax = 105.50 * 5% = 5.275 → 5.28
    expect(r.tax).toBe(5.28);
    // total = 105.50 + 10.55 + 5.28 = 121.33
    expect(r.total).toBe(121.33);
  });

  it("client sends inflated discount → server uses order's smaller value", () => {
    // If client sent discountAmount: 100 but order has discount: 10,
    // the recalc uses 10 (the orderDiscount param), not the client's 100.
    const r = recalculateBillTotals(ITEMS, 10, UAE_TENANT);
    expect(r.discount).toBe(10);
    // afterDiscount = 115.50, not 25.50
    expect(r.total).toBeGreaterThan(100);
  });

  it("client sends wrong tax → server overrides with correct tax", () => {
    const r = recalculateBillTotals(ITEMS, 0, UAE_TENANT);
    // UAE 5% on 125.50 = 6.28, regardless of what client submitted
    expect(r.tax).toBe(6.28);
  });

  it("client sends low total → server overrides, discrepancy detected", () => {
    const r = recalculateBillTotals(ITEMS, 0, UAE_TENANT, 0, 0, 50.00);
    // Server total = 144.33, client sent 50.00
    expect(r.totalWithPacking).toBe(144.33);
    expect(r.discrepancy).toBeCloseTo(94.33, 1);
  });

  it("adds packing charge to total correctly", () => {
    const r = recalculateBillTotals(ITEMS, 0, UAE_TENANT, 5.00, 0.25);
    expect(r.total).toBe(144.33);  // base total unchanged
    expect(r.totalWithPacking).toBe(149.58); // 144.33 + 5.00 + 0.25
  });

  it("handles compound tax (service charge in tax base)", () => {
    const compoundTenant: TenantTaxConfig = { ...UAE_TENANT, compoundTax: true };
    const r = recalculateBillTotals(ITEMS, 0, compoundTenant);
    // afterDiscount = 125.50
    // serviceCharge = 125.50 * 10% = 12.55
    // taxBase = 125.50 + 12.55 = 138.05 (compound)
    // tax = 138.05 * 5% = 6.9025 → 6.90
    expect(r.tax).toBe(6.90);
    // total = 125.50 + 12.55 + 6.90 = 144.95
    expect(r.total).toBe(144.95);
  });

  it("handles zero tax type", () => {
    const noTax: TenantTaxConfig = { ...UAE_TENANT, taxType: "none" };
    const r = recalculateBillTotals(ITEMS, 0, noTax);
    expect(r.tax).toBe(0);
  });

  it("floors after-discount at zero (discount exceeds subtotal)", () => {
    const r = recalculateBillTotals(ITEMS, 999, UAE_TENANT);
    expect(r.discount).toBe(999);
    // afterDiscount = max(0, 125.50 - 999) = 0
    expect(r.serviceCharge).toBe(0);
    expect(r.tax).toBe(0);
    expect(r.total).toBe(0);
  });

  it("handles empty items array (subtotal = 0)", () => {
    const r = recalculateBillTotals([], 0, UAE_TENANT);
    expect(r.subtotal).toBe(0);
    expect(r.total).toBe(0);
  });

  it("handles items with string quantities and prices", () => {
    const items: BillLineItem[] = [{ price: "10.50", quantity: "3" }];
    const r = recalculateBillTotals(items, 0, UAE_TENANT);
    expect(r.subtotal).toBe(31.50);
  });

  it("GST split uses || 0 defaults (order-creation formula), not ?? 9", () => {
    // Tenant with explicitly zero GST rates
    const zeroGST: TenantTaxConfig = {
      ...INDIA_GST_TENANT,
      cgstRate: 0,
      sgstRate: 0,
    };
    const r = recalculateBillTotals(ITEMS, 0, zeroGST);
    // With || 0 defaults, both rates are 0, rateSum = 0
    // Fallback: 50/50 split (CGST gets rounded half, SGST gets remainder)
    // tax = 125.50 * 18% = 22.59; half = 11.295 → CGST = 11.30, SGST = 11.29
    expect(r.cgstAmount! + r.sgstAmount!).toBe(r.tax);
    expect(Math.abs(r.cgstAmount! - r.sgstAmount!)).toBeCloseTo(0.01, 2);
  });

  it("no discrepancy when client total not provided", () => {
    const r = recalculateBillTotals(ITEMS, 0, UAE_TENANT);
    expect(r.discrepancy).toBeNull();
  });

  it("zero discrepancy when client total matches", () => {
    const r = recalculateBillTotals(ITEMS, 0, UAE_TENANT, 0, 0, 144.33);
    expect(r.discrepancy).toBe(0);
  });
});

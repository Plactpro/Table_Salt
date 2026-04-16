/**
 * F-121 fix: Server-side bill total recalculation from order items.
 *
 * Mirrors the order-creation calculation at orders.ts:418-562.
 * The bill creation handler must NEVER trust client-submitted monetary
 * values — it recomputes from the ground truth (order items + tenant config).
 */

export interface BillLineItem {
  price: string | number;
  quantity: string | number;
}

export interface TenantTaxConfig {
  taxRate: string | number;    // raw percentage, e.g. "5" for 5%
  taxType: string | null;      // "vat", "gst", "none", or null
  compoundTax: boolean;        // whether service charge is included in tax base
  serviceCharge: string | number; // raw percentage, e.g. "10" for 10%
  currency: string | null;
  cgstRate?: string | number | null;
  sgstRate?: string | number | null;
}

export interface BillRecalcResult {
  subtotal: number;
  discount: number;
  serviceCharge: number;
  tax: number;
  total: number;               // subtotal - discount + serviceCharge + tax (excludes packing)
  totalWithPacking: number;    // total + packingCharge + packingChargeTax
  cgstAmount: number | null;
  sgstAmount: number | null;
  isGST: boolean;
  taxBreakdown: Record<string, string> | null;
  discrepancy: number | null;  // absolute diff between client total and server total, if provided
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Recalculate bill totals from order items and tenant configuration.
 *
 * @param items         Order line items (price * quantity = line total)
 * @param orderDiscount Discount amount from the order (server-calculated at order creation)
 * @param tenantConfig  Tenant's tax/service-charge configuration
 * @param packingCharge Server-calculated packing charge (0 for dine-in)
 * @param packingTax    Tax on packing charge
 * @param clientTotal   Client-submitted total (for discrepancy detection only; never used for storage)
 */
export function recalculateBillTotals(
  items: BillLineItem[],
  orderDiscount: number,
  tenantConfig: TenantTaxConfig,
  packingCharge: number = 0,
  packingTax: number = 0,
  clientTotal?: number,
): BillRecalcResult {
  // 1. Subtotal from line items
  const subtotal = round2(
    items.reduce((sum, item) => {
      const price = Number(item.price) || 0;
      const qty = Number(item.quantity) || 0;
      return sum + price * qty;
    }, 0)
  );

  // 2. Discount from order (server-calculated at order creation time)
  const discount = round2(Math.max(0, orderDiscount));

  // 3. After-discount (floor at 0)
  const afterDiscount = Math.max(0, subtotal - discount);

  // 4. Service charge on post-discount amount
  const serviceChargeRate = Number(tenantConfig.serviceCharge || 0) / 100;
  const serviceCharge = round2(afterDiscount * serviceChargeRate);

  // 5. Tax — mirrors orders.ts:509-551
  const taxRate = tenantConfig.taxType === "none"
    ? 0
    : Number(tenantConfig.taxRate || 0) / 100;
  const taxBase = tenantConfig.compoundTax
    ? afterDiscount + serviceCharge
    : afterDiscount;
  const tax = round2(taxBase * taxRate);

  // 6. GST CGST/SGST split — mirrors orders.ts:555-561 (NOT the old billing
  //    formula that used ?? 9 defaults)
  const isGST = tenantConfig.currency === "INR" && tenantConfig.taxType === "gst";
  let cgstAmount: number | null = null;
  let sgstAmount: number | null = null;
  let taxBreakdown: Record<string, string> | null = null;

  if (isGST && tax > 0) {
    const cgstRate = Number(tenantConfig.cgstRate || 0);
    const sgstRate = Number(tenantConfig.sgstRate || 0);
    const rateSum = cgstRate + sgstRate;
    cgstAmount = rateSum > 0
      ? round2(tax * cgstRate / rateSum)
      : round2(tax / 2);
    sgstAmount = round2(tax - cgstAmount);
    taxBreakdown = {
      [`CGST (${cgstRate}%)`]: cgstAmount.toFixed(2),
      [`SGST (${sgstRate}%)`]: sgstAmount.toFixed(2),
    };
  }

  // 7. Totals
  const total = round2(afterDiscount + serviceCharge + tax);
  const totalWithPacking = round2(total + packingCharge + packingTax);

  // 8. Discrepancy detection (for tampering signals)
  const discrepancy = clientTotal !== undefined
    ? round2(Math.abs(clientTotal - totalWithPacking))
    : null;

  return {
    subtotal,
    discount,
    serviceCharge,
    tax,
    total,
    totalWithPacking,
    cgstAmount,
    sgstAmount,
    isGST,
    taxBreakdown,
    discrepancy,
  };
}

# Phase 4 — Money and Currency Audit

**Date:** 2026-04-15
**Scope:** All monetary columns, currency configuration, tax calculation, rounding, tip/discount logic, payment gateway integration, and reporting aggregation.

---

## 1. Monetary Column Inventory

**Total monetary columns found:** ~155 across 50+ tables.

### Data Type Summary

| Type | Count | Assessment |
|------|-------|------------|
| `decimal(precision, scale)` | ~120 | Correct — PostgreSQL arbitrary-precision |
| `numeric(precision, scale)` | ~15 | Correct — PostgreSQL synonym for decimal |
| `numeric()` (no precision/scale) | **14** | **Problem** — arbitrary scale per row, inconsistent aggregation |
| `text` storing money | **3** | **Problem** — no DB-level numeric validation |
| `integer` storing money | **3** | **Problem** — truncates fractional amounts |
| `real` / `float` / `double` | **0** | Correct — none found |

### Columns Missing Precision/Scale (14 monetary columns)

| Table | Column | Line | Impact |
|-------|--------|------|--------|
| `orderItems` | `itemDiscount` | 569 | Different items can have different decimal scales — aggregation inconsistency |
| `parkingLayoutConfig` | `overnightFee` | 4893 | |
| `valetTickets` | `finalCharge` | 5056 | |
| `valetIncidents` | `estimatedDamageCost` | 5350 | |
| `valetIncidents` | `actualDamageCost` | 5351 | |
| `valetShifts` | `totalTips` | 5372 | |
| `valetShifts` | `totalFees` | 5373 | |
| `valetStaffAssignments` | `tipsCollected` | 5397 | |
| `adCampaigns` | `ratePerDay` | 5676 | |
| `adCampaigns` | `ratePer1000Imp` | 5677 | |
| `adCampaigns` | `totalContractValue` | 5678 | |
| `adCampaigns` | `amountPaid` | 5679 | |
| `adCampaigns` | `balanceDue` | 5680 | |
| `adRevenueRecords` | `amountEarned` | 5744 | |

### Money Stored as `text` (3 columns in `promotionRules`)

| Column | Line | Why It Matters |
|--------|------|---------------|
| `discountValue` | 2544 | No DB-level validation that value is numeric |
| `maxDiscount` | 2551 | Same |
| `minOrderAmount` | 2552 | Same |

### Money Stored as `integer` (3 columns in loyalty)

| Table | Column | Line | Issue |
|-------|--------|------|-------|
| `loyaltyTierConfig` | `minSpend` | 5922 | Truncates cents/fils/paise — a 500.75 AED threshold becomes 500 |
| `loyaltyTierConfig` | `maxSpend` | 5923 | Same |
| `loyaltyTierLog` | `totalSpend` | 5946 | Same |

### Currency Column Coverage

Of ~50 tables with monetary columns, only **8** have a currency field on the same row. Critical tables **without** currency:

| Table | Monetary Columns | Currency Source |
|-------|-----------------|----------------|
| `orders` | subtotal, tax, discount, total, tips, serviceCharge | Derived from tenant at read time |
| `bills` | subtotal, taxAmount, totalAmount, tips, serviceCharge, cgstAmount, sgstAmount | **None** — no currency column |
| `billPayments` | amount | Inherited from bill (which has no currency) |
| `orderItems` | price, itemDiscount | Inherited from order (which has no currency) |
| `menuItems` | price | Derived from tenant |
| `purchaseOrders` | totalAmount, subtotal, taxAmount, etc. | **None** |
| `inventoryItems` | costPrice, averageCost, etc. | **None** |
| `franchiseInvoices` | netSales, calculatedRoyalty, finalAmount | **None** |

**Impact:** If a tenant changes their currency (or operates outlets in different currencies), all historical records become ambiguous. Cross-outlet aggregation with different currencies silently produces wrong sums.

---

## 2. Currency Configuration and Flow

### How Currency Is Determined

```
tenants.currency (default "USD")  ← set at registration, modifiable via PATCH /api/tenant
    └─ outlets.currencyCode (default "AED")  ← per-outlet override
        └─ cashSessions.currencyCode  ← snapshotted at session open
        └─ outletTipSettings.currencyCode  ← per-outlet
        └─ outletPackingSettings.currencyCode  ← per-outlet
```

**Critical gap:** `tenants.currency` defaults to "USD" while `outlets.currencyCode` defaults to "AED". A new tenant in India gets `currency: "USD"` unless they set it during onboarding — but the default outlet gets `currencyCode: "AED"`. These can diverge.

### `shared/currency.ts` Analysis

| Feature | Implementation | Issue |
|---------|---------------|-------|
| Supported currencies | 24 (CurrencyCode type) | Adequate for stated markets |
| Exchange rates | Hardcoded static constants | **Stale** — no update mechanism, no timestamps |
| `formatCurrency()` | `Intl.NumberFormat` with locale | Correct for display |
| `convertCurrency()` | `(amount / fromRate) * toRate` | **Result not rounded** — caller must round |
| `applyRounding()` | Per-denomination rounding rules | Only 6 of 24 currencies have configs |
| `denominationBreakdown()` | Greedy denomination algorithm | Correct for cash drawer |

### Where Exchange Rates Are Used

`convertCurrency()` is available for import but usage is limited:
- Not called in order creation, billing, or payment flows
- Potentially used in analytics/reporting display (not financial calculations)
- **Impact:** If used in financial aggregation, stale rates produce wrong numbers. If display-only, impact is cosmetic.

---

## 3. Rounding Analysis

### Order Creation Rounding (server/routers/orders.ts)

| Step | Rounded? | Method | Line |
|------|----------|--------|------|
| Per-item price (after modifiers) | **NO** | — | 492 |
| Subtotal accumulation | After all items | `Math.round(x*100)/100` | 504 |
| Offer discount | YES | `Math.round(x*100)/100` | 542 |
| Total discount | YES | `Math.round(x*100)/100` | 547 |
| Service charge | YES | `Math.round(x*100)/100` | 549 |
| Tax | YES | `Math.round(x*100)/100` | 551 |
| Grand total | YES | `Math.round(x*100)/100` | 552 |
| CGST | YES | `Math.round(x*100)/100` | 559 |
| SGST | YES (remainder) | `serverTax - cgstAmount` | 560 |

**Issue:** Per-item prices are NOT rounded before accumulation. `computeEffectivePrice` (line 101) applies size multipliers (Half=-0.2, Large=+0.3) that can produce fractional cents (e.g., 7.99 * 0.8 = 6.392). These float through to the subtotal sum before the final round.

### Cash Rounding (shared/currency.ts)

| Currency | Rounding | Config |
|----------|----------|--------|
| INR | Round to 1 (nearest rupee) | `ROUND_1` |
| AED | Round to 0.25 (nearest 25 fils) | `ROUND_0.25` |
| SGD | Round to 0.05 | `ROUND_0.05` |
| USD, GBP, EUR | No rounding | `NONE` |
| JPY, KRW, IDR | **Not configured** | Falls to `NONE` (wrong — JPY has 0 decimals) |
| Other 15 currencies | **Not configured** | Falls to `NONE` |

**Issue:** `applyRounding(amount, 'ROUND_0.25')` → `Math.round(amount / 0.25) * 0.25` can produce floating-point artifacts (e.g., 1.0500000000000003). No re-rounding to the currency's decimal places.

### Bill Creation Rounding

**None.** Bill totals are taken directly from `req.body` without any rounding or recalculation.

### Payment Recording Rounding

Payment sum validation uses `Math.abs(paymentSum - liveBillTotal) > 1.01` — a tolerance of 1.01 currency units. No currency-specific tolerance.

---

## 4. Tax Calculation

### Calculation Order

```
subtotal = Σ(item.price * item.qty)  [server-calculated at order creation]
discount = engine + offer + manual
afterDiscount = max(0, subtotal - discount + surcharges)
serviceCharge = afterDiscount * serviceChargeRate
taxBase = compoundTax ? (afterDiscount + serviceCharge) : afterDiscount
tax = taxBase * taxRate
total = afterDiscount + serviceCharge + tax
```

**Discounts applied BEFORE tax.** Tax is on post-discount amount. This is correct for most jurisdictions. Tips are NOT in the tax base (added at payment time). Packing charges have their own independent tax rate.

### UAE VAT

- Rate: `tenant.taxRate` (generic field, default "0")
- Outlets have `outletTaxRate` (default "5")
- No VAT-specific logic — treated as a single flat rate
- **Missing:** TRN on invoices, FTA-compliant format, sequential invoice numbers (F-059, F-060)

### India GST

| Aspect | Implementation | Issue |
|--------|---------------|-------|
| Detection | `tenant.currency === "INR" && tenant.taxType === "gst"` | Correct |
| CGST rate | `tenant.cgstRate` (configurable) | Default differs: `\|\| 0` in orders vs `?? 9` in billing |
| SGST rate | `tenant.sgstRate` (configurable) | Same default inconsistency |
| Split method | `cgst = tax * cgstRate / (cgstRate + sgstRate)` then `sgst = tax - cgst` | Correct (remainder-based ensures sum) |
| Fallback | If rates both 0: orders do 50/50 split; billing assumes 9%/9% | **Inconsistent** |
| IGST | **Not implemented** | Non-compliant for inter-state supply |
| HSN codes | Exist on `menuItems.hsnCode` | **Not propagated** to bill/invoice line items |
| Place of supply | **Not implemented** | Required to determine CGST/SGST vs IGST |
| E-invoicing | **Not implemented** | Required above ₹5Cr threshold |

### GST Default Inconsistency Detail

| Context | cgstRate default | sgstRate default | Zero-rate fallback |
|---------|-----------------|------------------|--------------------|
| `orders.ts:557` | `tenant.cgstRate \|\| 0` | `tenant.sgstRate \|\| 0` | `serverTax / 2` |
| `restaurant-billing.ts:282` | `tenant?.cgstRate ?? 9` | `tenant?.sgstRate ?? 9` | `tax * 9 / 18` |

If a tenant has `cgstRate: null, sgstRate: null`:
- Order records: CGST=50% of tax, SGST=50%
- Bill records: CGST=50% of tax, SGST=50% (numerically same but via different formula)

If a tenant has `cgstRate: 0, sgstRate: 0`:
- Order records: `0 || 0` = 0, fallback to `serverTax / 2`
- Bill records: `0 ?? 9` = 0 (not null, so `??` doesn't trigger), sum=0, fallback to `tax * 0 / 18 = 0` — **CGST and SGST both become 0!**

This is a **real bug**: a tenant with explicitly zero GST rates gets different behavior in orders (50/50 split) vs bills (both zero).

---

## 5. Tip and Service Charge Handling

### Service Charge
- Rate: `tenant.serviceCharge` / 100
- Applied on post-discount subtotal
- If `compoundTax` enabled: included in tax base (correct for UAE, where service charge is taxable)
- Stored on `orders.serviceCharge` and `bills.serviceCharge`

### Tips
- Stored on `bills.tips`, `billTips` (per-bill), `tipDistributions` (per-staff)
- NOT included in tax base (correct)
- Added to payment total at payment time: `billTotal = totalAmount + tips`
- Pool distribution types: INDIVIDUAL (100% waiter), POOL (equal split), SPLIT (waiter/kitchen configurable %)

### Tip Rounding Issues
- **Pool split:** `tipAmount / staff.length` → `.toFixed(2)` — loses remainder (100/3 = 33.33*3 = 99.99)
- **Waiter/kitchen split:** `tipAmount * (pct/100)` → `.toFixed(2)` — similar loss possible
- No remainder handling or "last person gets the extra cent" logic

---

## 6. Discount and Promotion Logic

### Discount Types
| Type | Calculation | Capped? |
|------|-------------|---------|
| Percentage | `itemTotal * (value/100)` per item | Yes: `maxDiscount` |
| Fixed amount | Flat value | No per-item cap |
| Surcharge | Negative discount (adds to order) | No cap |
| BOGO | Free units * price * discount% | Per item |
| Combo deal | % of combo total or fixed | Per combo |
| Free item | Item added at 0 cost | N/A |
| Manual | `manualDiscountAmount` from client | **NOT capped server-side** |

### Can Discounts Produce Negative Totals?
**No.** `Math.max(0, subtotal - totalDiscount + surcharges)` at orders.ts:548 floors at zero.

### Manual Discount Vulnerability
`manualDiscountAmount` from `req.body` is accepted without server-side cap. The supervisor override check (orders.ts:403-412) only examines `orderData.discount` (percentage field), NOT `manualDiscountAmount`. Any user with sufficient permissions can zero out an order by submitting `manualDiscountAmount >= subtotal`.

### Order of Operations Consistency

| Step | Order Creation | Promotions Engine | Bill Creation |
|------|---------------|-------------------|---------------|
| Subtotal | Server-calculated | Input | **Client-submitted** |
| Discount | Server-calculated | Calculated | **Client-submitted** |
| Service charge | On post-discount | On post-discount | **Client-submitted** |
| Tax (compound) | afterDiscount + SC | afterDiscount only (bug) | **Client-submitted** |
| Total | Server-calculated | Calculated | **Partially recalculated** |
| Validation | N/A | N/A | At payment time only |

**The bill creation path trusts ALL client-submitted monetary values.** A malicious client can submit `taxAmount: 0` for a bill that should have VAT, effectively evading tax. The payment-time validation catches gross discrepancies but uses the already-tampered bill values as its basis.

---

## 7. Payment Gateway Integration

### Razorpay

| Aspect | Implementation | Issue |
|--------|---------------|-------|
| Minor unit conversion | `Math.round(amountRupees * 100)` | Assumes centesimal currency (100 subunits) |
| Currency parameter | Defaults to INR; caller can override | Dual-default chain: razorpay.ts defaults INR, restaurant-billing.ts defaults AED |
| Webhook signature | `expected === signature` | **Non-constant-time** comparison (F-045) |
| Amount reconciliation | **None** | Webhook accepts whatever Razorpay reports without comparing to local bill total |
| Refund validation | Validates against net paid amount | Correct |
| Gateway-down fallback | `manual-pending` status with `gatewayStatus: 'gateway_down'` | Good |

### Stripe

| Aspect | Implementation | Issue |
|--------|---------------|-------|
| API version | `2025-02-24.acacia` | Current |
| Subscription amounts | Price IDs from Stripe, not locally calculated | Correct |
| Order payment checkout | `amount: Math.round(amount * 100)` | Same centesimal assumption |
| Webhook signature | Stripe SDK `constructEvent()` — timing-safe | Correct |
| Amount reconciliation | **None** — `checkout.session.completed` marks order paid without comparing gateway amount to local total | Gap |

### Non-Centesimal Currency Risk

`Math.round(amount * 100)` is wrong for:
- **JPY** (0 decimal places): 1000 JPY → sends 100000 (100x overpayment)
- **KRW** (0 decimal places): same
- **BHD** (3 decimal places): 1.500 BHD → sends 150 (should send 1500)

The currencyMap defines `decimalPlaces` per currency but this is NOT consulted during gateway conversion.

---

## 8. Reporting and Cross-Currency Aggregation

### Dashboard Revenue (server/routers/staff.ts + storage.ts)

`GET /api/dashboard` → `storage.getDashboardStats(tenantId)`:
```sql
SELECT COALESCE(SUM(CAST(total AS numeric)), 0) AS total_revenue FROM orders WHERE tenant_id = $1 ...
```
Scoped by `tenant_id` only — sums across all outlets regardless of currency.

### Reports (server/routers/reports.ts)

All 6 report compute functions (`revenue`, `sales`, `taxes`, `discounts`, `payments`, `items`) query with `tenant_id` filter only. `outletId` parameter is accepted by the API but **never passed to the compute functions** — outlet filtering is silently broken.

### Daily Email Report (server/services/daily-report-scheduler.ts)

Sums revenue across all outlets per tenant. Formats with tenant's currency symbol. If outlets have different currencies, the sum is meaningless.

### Accounting Export (QuickBooks/Xero)

Export endpoint (reports.ts:622-691) outputs amounts with NO currency field. Multi-currency tenants would produce invalid accounting data.

### Analytics Helpers (server/analytics-helpers.ts)

All helper functions aggregate monetary values by tenant without currency grouping. 15+ SQL queries use `SUM()` on monetary columns scoped to `tenant_id` only.

---

## 9. Findings Summary

### New findings from this phase (not already in FINDINGS.md)

These are findings discovered by the schema and tax/discount agents that complement F-101 through F-116.

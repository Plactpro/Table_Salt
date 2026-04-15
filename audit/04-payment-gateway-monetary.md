# Phase 4: Payment Gateway Amount Handling & Reporting Aggregation Audit

Audited: 2026-04-15
Scope: Monetary correctness in payment gateways (Razorpay, Stripe), webhook reconciliation, refund validation, and reporting/aggregation for cross-currency safety.

---

## Part 1: Payment Gateway Amount Handling

### 1.1 Razorpay — `server/razorpay.ts`

#### Minor-unit conversion (line 60)
```ts
const amountPaise = Math.round(params.amountRupees * 100);
```
[VERIFIED] **F-101 (Medium / Money):** Uses `Math.round(amount * 100)` for minor-unit conversion. This is a classic floating-point risk. For example, `19.99 * 100` yields `1998.9999999999998` in IEEE 754, which `Math.round` would correct to `1999`. However, values like `1.005 * 100 = 100.49999...` would round DOWN to `100` instead of `101`. For small-currency-unit rounding at the boundary, the standard-safe approach is `Math.round((amount * 100 + Number.EPSILON))` or integer-only arithmetic. The risk is LOW for typical restaurant bill sizes but is architecturally incorrect for a multi-currency payment system.

#### Currency handling (line 63)
```ts
currency: params.currency || "INR",
```
[VERIFIED] **F-102 (Medium / Money):** Default currency is `"INR"` in the parameter fallback, but the caller at `restaurant-billing.ts:1092` passes `tenant.currency || "AED"`. This means: (a) the Razorpay module defaults to INR, (b) the restaurant billing caller defaults to AED, creating a confusing dual-default chain. If `tenant.currency` is null/undefined AND the caller omits currency, Razorpay gets `"AED"`. If the Razorpay function is called directly without the caller fallback, it defaults to `"INR"`. The parameter name `amountRupees` is misleading since it handles any currency.

#### Webhook signature verification (line 109-113)
```ts
return expected === signature;
```
[VERIFIED] **F-045 (already logged, High / Crypto):** Uses string `===` comparison rather than `crypto.timingSafeEqual`. Susceptible to timing-based side-channel attacks on the HMAC. Confirmed in prior phase.

#### Webhook amount reconciliation
[VERIFIED] **F-103 (High / Money):** In `server/index.ts:95` and `restaurant-billing.ts:1195`, the webhook/polling handler converts the Razorpay amount back:
```ts
amountStr: pl.amount != null ? String(pl.amount / 100) : bill.totalAmount,
```
This divides the paise amount by 100 to get the major unit. However, there is **no validation that this amount matches the local bill total**. The `finalizeBillCompletion` function at `restaurant-billing.ts:49-123` accepts the `amountStr` parameter and records it directly via `storage.createBillPayment` (line 66-72). A payment for a DIFFERENT amount (partial payment, overpayment) would be recorded as-is without any mismatch check.

Additionally, the webhook handler at `server/index.ts:83-96` looks up the bill by `pl.reference_id` (which is the bill UUID), but does NOT verify that `pl.amount / 100` matches `bill.totalAmount`. This means if an attacker could somehow trigger a payment link with a modified amount (unlikely but defense-in-depth), the system would mark the bill as fully paid regardless of the amount.

#### Refund validation (lines 116-143)
[VERIFIED] Refund amount is passed as `amountPaise` directly from the caller. The refund validation happens in `restaurant-billing.ts:820-847`:
- Line 820: Checks `refund amount <= net paid` (total paid minus total refunded)
- Line 836-847: Per-payment cap validates refund does not exceed the specific original payment minus already-refunded amount
- Line 857: `Math.round(Number(amount) * 100)` converts to paise for the Razorpay API call

[VERIFIED] Refund validation is thorough. No issue beyond the same `Math.round(x * 100)` floating-point concern.

### 1.2 Stripe Client — `server/stripeClient.ts`

[VERIFIED] Stripe client initialization:
- Line 9: `secretKey = process.env.STRIPE_SECRET_KEY || ""` — empty string fallback
- Line 16-18: `new Stripe(secretKey, { apiVersion: "2025-02-24.acacia" })` — explicit API version pinned
- Line 21-23: Publishable key getter exposes the key (correct for Stripe, publishable key is public)

[VERIFIED] **F-104 (Low / Dead Code):** Lines 29-42 import `stripe-replit-sync` which is a Replit-specific package. Comment says "Railway-compatible" but this sync module is still imported. If `stripe-replit-sync` is not in `package.json` dependencies, this will crash at runtime when called.

### 1.3 Stripe Price Discovery — `server/stripe.ts`

[VERIFIED] Price discovery at lines 69-93:
- Iterates active prices from Stripe API
- Matches by `product.metadata.plan_key` against `["basic", "standard", "premium"]`
- Stores price ID in a runtime map (`STRIPE_PRICE_IDS`)
- No amount validation: whatever Stripe has configured IS the amount

[VERIFIED] **No hardcoded plan amounts.** Plan pricing is entirely determined by the Stripe product catalog. This is correct — prices should be defined in Stripe, not in code.

[VERIFIED] Trial period: `TRIAL_DAYS = 30` (line 35). `trialEndsAtDate()` computes 30 days from now. Trial logic is independent of Stripe trial periods.

### 1.4 Stripe Billing — `server/routers/billing.ts`

#### Checkout session creation (lines 138-184)
[VERIFIED] The checkout session:
- Uses `mode: "subscription"` (line 161)
- Passes `price: priceId` from discovered prices (line 165) — amount/currency are defined in Stripe dashboard, not in code
- **No explicit currency parameter** — Stripe uses the price object's currency
- Metadata includes `tenantId` and `plan` (line 166)

[VERIFIED] This is correct for subscription billing. The currency is controlled by the Stripe price configuration, not by application code.

#### Webhook reconciliation (lines 224-372)
[VERIFIED] The Stripe webhook handler:
- Verifies signature via `stripeClient.webhooks.constructEvent` (line 238) — correct, uses Stripe's built-in verification
- `checkout.session.completed` (line 256): Updates tenant plan/status. **No amount verification** — it trusts that if Stripe says the session completed, the correct amount was charged. For subscription billing this is acceptable since the price is server-defined in Stripe.
- `customer.subscription.updated` (line 317): Maps Stripe price ID back to plan name via `planFromPriceId`. Falls back to `"basic"` if unknown (line 322) — a configuration error could silently downgrade a tenant.
- `invoice.payment_failed` (line 352): Sets tenant to `past_due`

[VERIFIED] **F-105 (Medium / Resilience):** At line 258-294, the `checkout.session.completed` handler also processes order payments (for kiosk/guest checkout). It marks orders as "paid" and deducts inventory. However, **there is no amount verification** — it trusts that the Stripe session amount matches the order total. If a checkout session was created with an incorrect amount (bug in session creation), the order would be marked paid without the correct payment.

### 1.5 Restaurant Billing — `server/routers/restaurant-billing.ts`

#### Razorpay payment link creation (lines 1063-1132)
[VERIFIED] Amount derivation at line 1079:
```ts
const serverAmount = Number(bill.totalAmount) + tipVal;
```
Server-side: amount is derived from the stored `bill.totalAmount` plus parsed tips. Comment on line 1078 confirms "never trust client-supplied amount."

[VERIFIED] At line 1090-1097, `createPaymentLink` is called with:
- `amountRupees: serverAmount` — server-derived (good)
- `currency: tenant.currency || "AED"` — from tenant config with AED fallback

**F-106 (Medium / Money):** The parameter is named `amountRupees` but is used for any currency. The `createPaymentLink` function multiplies by 100 to get "paise" — but for non-INR currencies this is "cents" or "fils" (AED has 100 fils). For currencies without centesimal divisions (e.g., JPY, KRW), multiplying by 100 produces incorrect values. Razorpay requires amounts in the smallest currency unit, which is NOT always `major * 100`.

#### Webhook/polling reconciliation (lines 1175-1206)
[VERIFIED] At line 1195:
```ts
amountStr: link.amount ? String(link.amount / 100) : bill.totalAmount,
```
If Razorpay returns the amount, it divides by 100; otherwise falls back to the bill total. **No comparison is made between the Razorpay amount and the local bill total.** See F-103.

---

## Part 2: Reporting and Aggregation

### 2.1 Reports — `server/routers/reports.ts`

#### Reports available:
1. WEEKLY_REVENUE (line 54-95)
2. TOP_DISHES (line 97-122)
3. PEAK_HOURS (line 124-161)
4. STOCK_MOVEMENT (line 163-202)
5. CHEF_ACCOUNTABILITY (line 204-246)
6. WASTAGE_ANALYSIS (line 248-290)
7. AUDIT_TRAIL_EXPORT (line 292-323)
8. INVENTORY_VALUATION (line 325-361)
9. SHIFT_RECONCILIATION (line 363-405)
10. QuickBooks/Xero accounting export (line 560-691)

#### Cross-currency aggregation analysis

[VERIFIED] **F-107 (High / Money):** All report queries filter by `tenant_id` only — NOT by `outlet_id`. Example at line 58-67:
```sql
SELECT DATE_TRUNC('week', created_at)::date AS week_start,
       COUNT(*) FILTER (...) AS order_count,
       COALESCE(SUM(total::numeric) FILTER (...), 0) AS revenue
FROM orders WHERE tenant_id = $1 ...
```
This sums `total` across ALL outlets for the tenant. Since outlets can have different `currency_code` (schema at `shared/schema.ts:218`), this SUM may aggregate amounts in different currencies (e.g., AED + INR) into a single number. **No GROUP BY on outlet or currency.** No currency field in the output.

This affects:
- `computeWeeklyRevenue` (line 58-67): SUM(total) across all outlets
- `computeTopDishes` (line 101-109): SUM(price * qty) across all outlets
- `computePeakHours` (line 128-139): SUM(total) across all outlets
- `computeChefAccountability` (line 208-219): SUM(wastage_cost) across all outlets
- `computeWastageAnalysis` (line 252-259): SUM(total_cost) across all outlets

[VERIFIED] **F-108 (Medium / Money):** The `enqueueReport` function (line 439-443) receives an `outletId` parameter but does NOT pass it to the compute function:
```ts
const result = await computer(tenantId, params);
```
The `outletId` is stored in `report_cache.outlet_id` for bookkeeping but is ignored during computation. Even if a client requests a report for a specific outlet, the compute functions aggregate across all outlets.

[VERIFIED] **F-109 (Medium / Money):** The QuickBooks IIF export (line 622-651) and Xero CSV export (line 654-691) do not include any currency field. The `generateQuickBooksIIF` function outputs amounts as bare numbers. For QuickBooks, the receiving system would need to know the currency to import correctly. For Xero, the CSV lacks a currency column. If bills span multiple currencies, the export is invalid.

[VERIFIED] **No currency in report output.** None of the 9 report types include a `currency` field in their JSON output. The caller has no way to know what currency the aggregated number represents.

### 2.2 Daily Report Scheduler — `server/services/daily-report-scheduler.ts`

[VERIFIED] **F-110 (Medium / Money):** At line 33:
```sql
SELECT COALESCE(SUM(total), 0)::numeric as total_revenue, COUNT(*)::int as order_count
FROM orders WHERE tenant_id = $1 AND DATE(created_at) = $2 AND status = 'paid'
```
Sums revenue across all outlets for the tenant. The email (line 52) displays:
```html
<p><b>Revenue:</b> ${Number(rev.total_revenue).toFixed(2)}</p>
```
**No currency symbol or code.** If a tenant has outlets in different currencies, the total is a meaningless cross-currency sum, and the owner receives a number with no currency context.

### 2.3 Analytics Helpers — `server/analytics-helpers.ts`

[VERIFIED] **F-111 (Medium / Money):** All helper functions operate on in-memory `OrderData[]` arrays with no currency awareness:
- `computeRevenueByDay` (line 71-93): `revenue += Number(o.total) || 0` — plain addition
- `computeHourlySales` (line 95-120): same pattern
- `computeChannelMix` (line 122-132): same pattern
- `computeHeatmap` (line 134-150): same pattern
- `computeFinanceTotals` (line 171-198): `netSales += sub` — no currency grouping
- `computeWeeklyForecast` (line 200-248): same pattern

The `OrderData` interface (line 1-13) has no `currency` field. These helpers are used by `server/routers/staff.ts:114-174` (operations report) which fetches all orders for a tenant via `storage.getOrdersByTenant(user.tenantId)` — aggregating across all outlets regardless of currency.

### 2.4 Staff Dashboard — `server/routers/staff.ts:76-80`

[VERIFIED] **F-112 (High / Money):** The `/api/dashboard` endpoint calls `storage.getDashboardStats(tenantId)` which at `storage.ts:1459-1462` does:
```ts
sum(orders.total)
```
across ALL orders for the tenant. No outlet filter, no currency grouping. Returns `totalRevenue` and `todayRevenue` as bare numbers. This is the main dashboard seen by all staff.

[VERIFIED] **F-113 (High / Money):** The `/api/analytics/summary` endpoint at `staff.ts:93-106` calls `storage.getSalesReport` which at `storage.ts:1526-1530`:
```ts
sum(orders.total)
```
across all tenant orders in date range. Returns `totalRevenue`, `netRevenue`, etc. as bare numbers. No currency.

### 2.5 Workforce Dashboard — `server/routers/workforce.ts:26-200`

[VERIFIED] **F-114 (High / Money):** At line 54:
```ts
const totalSales = periodOrders.reduce((sum, o) => sum + parseFloat(o.total || "0"), 0);
```
Sums all orders for the tenant. Then at line 168:
```ts
const labourPct = totalSales > 0 ? (totalActualCost / totalSales) * 100 : 0;
```
Labour cost percentage is calculated using a denominator that may span multiple currencies. If a tenant has an INR outlet and an AED outlet, `totalSales` would be `INR_amount + AED_amount` — a meaningless number, making the labour percentage invalid.

[VERIFIED] **F-115 (Medium / Money):** Hourly rates at line 13:
```ts
const defaultRates: Record<string, number> = { owner: 50, manager: 35, waiter: 18, kitchen: 20, accountant: 30 };
```
Default rates are hardcoded with no currency. The `hourlyRate` field on users has no associated currency. If staff work across outlets with different currencies, cost calculations are invalid.

### 2.6 SQL SUM Aggregation Audit (Cross-Codebase)

[VERIFIED] **F-116 (High / Money):** The following SQL SUM queries on monetary columns are scoped to `tenant_id` only (not `outlet_id`), meaning they can aggregate across outlets with different currencies:

| File | Line | Column Summed | Scope |
|------|------|---------------|-------|
| `storage.ts` | 1461 | `orders.total` | tenant | 
| `storage.ts` | 1466 | `orders.total` | tenant |
| `storage.ts` | 1515-1530 | `orders.total`, `orders.tax`, `orders.discount` | tenant |
| `storage.ts` | 2020-2023 | `orders.total`, `orders.tax`, `orders.discountAmount` | tenant (via `getOutletKPIs` — **BUT this one can filter by outletId via parameter**) |
| `reports.ts` | 62 | `orders.total` | tenant |
| `reports.ts` | 71 | `bill_payments.amount` | tenant |
| `reports.ts` | 102 | `order_items.price * quantity` | tenant |
| `reports.ts` | 133 | `orders.total` | tenant |
| `reports.ts` | 211 | `stock_movements * cost_per_base_unit` | tenant |
| `reports.ts` | 255-256 | `wastage_logs.total_cost` | tenant |
| `daily-report-scheduler.ts` | 33 | `orders.total` | tenant |
| `service-coordination.ts` | 469 | `orders.total` | tenant |
| `customers.ts` | 185 | `orders.total` | tenant |
| `tips.ts` | 239-242 | `tip_distributions.amount` | tenant |
| `tips.ts` | 304-307 | `tip_distributions.amount` | tenant |

Notable exception: `getOutletKPIs` at `storage.ts:2012-2026` DOES accept an optional `outletId` filter and groups by `orders.outletId`. This is the only aggregation function that properly handles per-outlet scoping.

### 2.7 Missing Currency on Orders and Bills

[VERIFIED] **F-065 (already logged, Low / Data Integrity):** The `orders` table (`shared/schema.ts:426-485`) has no `currency` column. The `bills` table (`shared/schema.ts:2874-2932`) has no `currency` column. Currency is determined at display time by looking up the tenant or outlet. This means:
- Historical reports cannot determine what currency a past order was in if the tenant changes currency
- Cross-outlet SUMs have no currency column to GROUP BY
- Accounting exports cannot include per-transaction currency

---

## Summary of New Findings

| ID | Severity | Category | File | Line(s) | Description |
|----|----------|----------|------|---------|-------------|
| F-101 | Medium | Money | `server/razorpay.ts` | 60 | `Math.round(amount * 100)` floating-point risk for minor-unit conversion — boundary rounding errors possible |
| F-102 | Medium | Money | `server/razorpay.ts` + `restaurant-billing.ts` | 63, 1092 | Dual-default currency chain: Razorpay defaults to INR, caller defaults to AED — confusing and fragile |
| F-103 | High | Money | `server/index.ts` + `restaurant-billing.ts` | 95, 1195 | Razorpay webhook/polling does NOT compare gateway amount to local bill total — amount mismatch silently accepted |
| F-104 | Low | Dead Code | `server/stripeClient.ts` | 29-42 | `stripe-replit-sync` import — Replit-specific dead code on Railway deployment |
| F-105 | Medium | Money | `server/routers/billing.ts` | 258-294 | Stripe checkout.session.completed for order payments — no amount verification against order total |
| F-106 | Medium | Money | `server/razorpay.ts` + `restaurant-billing.ts` | 60, 1090-1092 | `amount * 100` assumes centesimal currency — fails for JPY, KRW, BHD (0 or 3 decimal currencies) |
| F-107 | High | Money | `server/routers/reports.ts` | 58-67, 101-109, 128-139 | All report queries SUM monetary columns across all outlets without currency grouping — cross-currency aggregation |
| F-108 | Medium | Money | `server/routers/reports.ts` | 439-443 | `outletId` parameter accepted but NOT passed to compute functions — outlet filtering is silently ignored |
| F-109 | Medium | Money | `server/routers/reports.ts` | 622-691 | QuickBooks/Xero accounting exports omit currency — invalid for multi-currency tenants |
| F-110 | Medium | Money | `server/services/daily-report-scheduler.ts` | 33, 52 | Daily email sums revenue across all outlets, displays no currency |
| F-111 | Medium | Money | `server/analytics-helpers.ts` | 1-248 | All analytics helper functions lack currency awareness — aggregate across currencies |
| F-112 | High | Money | `server/routers/staff.ts` + `storage.ts` | 78, 1459-1462 | Main dashboard `totalRevenue` sums across all outlets without currency |
| F-113 | High | Money | `server/routers/staff.ts` + `storage.ts` | 97, 1526-1530 | Analytics summary `totalRevenue`/`netRevenue` sums across all outlets without currency |
| F-114 | High | Money | `server/routers/workforce.ts` | 54, 168 | Labour cost % uses cross-currency totalSales as denominator |
| F-115 | Medium | Money | `server/routers/workforce.ts` | 13 | Default hourly rates hardcoded without currency context |
| F-116 | High | Money | (multiple files) | (see table) | 15+ SQL SUM queries on monetary columns scoped to tenant_id only, not outlet/currency |

---

## Open Questions

| ID | Phase | Question | Context |
|----|-------|----------|---------|
| Q-032 | 4 | Does any tenant currently operate outlets in multiple currencies? | Determines whether F-107/F-112/F-113/F-114/F-116 are theoretical or actively producing wrong numbers. |
| Q-033 | 4 | Is `stripe-replit-sync` in `package.json` dependencies? | If yes, it's dead weight; if no, calling `getStripeSync()` will crash. |
| Q-034 | 4 | Are there any non-centesimal currencies (JPY, KRW, BHD) configured for any tenant? | Determines real-world impact of F-106. |
| Q-035 | 4 | Is the Razorpay webhook at `server/index.ts:64-106` the only Razorpay webhook handler? | No reconciliation of Razorpay amount vs bill total exists anywhere. |
| Q-036 | 4 | Do the QuickBooks/Xero exports get used in production? | If yes, F-109 means accounting imports may silently use wrong currency. |

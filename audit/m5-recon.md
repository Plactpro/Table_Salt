# M5 Recon — POS UI delivery address field

**Date:** 2026-04-29 PM
**Scope:** read-only static analysis. No code changed. Cited line numbers are against `main` at commit `584e6af`.
**Bug ref:** M5 in `docs/audits/bug-inventory.md` (OPEN-MEDIUM): "No delivery address field in POS — pos.tsx delivery flow. deliveryOrders table has customerAddress, but POS UI does not capture it. Manual delivery orders have no address."
**Pre-req for:** PR B (`audit/pr-b-recon.md`) — currently blocked on M5.

## Summary

M5 adds a single-line text input for `deliveryAddress` to the POS order-placement flow, visible only when `orderType === "delivery"`, mirroring the existing phone-order page pattern at `client/src/pages/modules/phone-order.tsx:461-474`. The change is one file (`client/src/pages/modules/pos.tsx`): add a field to the `OrderTab` interface, render an Input below the existing customer-name/phone block, validate non-empty before order placement, and forward the value as `deliveryAddress` in the POST /api/orders body. Server-side requires no change today (POST /api/orders has no Zod validator and silently passes unknown body fields through `...orderData` spread); the new field becomes load-bearing once PR B reads it from `req.body.deliveryAddress`.

## POS delivery flow today

- **File:** `client/src/pages/modules/pos.tsx` (2,916 lines).
- **Order-type selector:** lines **1997–2005**. Three buttons (Dine-in / Takeaway / Delivery), each `onClick` calls `updateActiveTab({ orderType: <value> })`. The `<Truck>` icon distinguishes the Delivery button (line 2003-2004).
- **Customer-fields block:** lines **2031–2042**. Two-column grid (`grid grid-cols-2 gap-2`) appearing inside a `motion.div` keyed `"customer-fields"`, gated on `!isDineIn` so it shows for **both** takeaway AND delivery. Two `<Input>` components: name (`data-testid="input-customer-name"`, line 2035) and phone (`data-testid="input-customer-phone"`, line 2039). **No address field exists today.**
- **OrderTab interface:** lines **98–113**. Holds per-tab UI state. Has `customerName?: string` (line 110) and `customerPhone?: string` (line 111). **No `customerAddress` / `deliveryAddress` field.**
- **Default tab state:** lines 196–197 (the initial `OrderTab` shape used when a new tab is created — `customerName: ""` and `customerPhone: ""` are explicitly seeded; the new field would need a parallel default).
- **Place-order validation:** `handlePlaceOrder` at lines **1353–1384**. For non-dine-in, validates customer name (lines 1367–1370) and customer phone (lines 1371–1374); each missing field produces a destructive toast and early return. **No address validation for delivery today.** Toast strings are hardcoded English (no `tp(...)` calls) — see "i18n / a11y notes" below.
- **Payload assembly:** `buildOrderData` (entry around line **1209**, exit at line 1241). Returns a `Record<string, unknown>` shaped for POST /api/orders. Customer fields are explicitly added at line **1237**: `if (!tabIsDineIn) { orderData.customerName = ...; orderData.customerPhone = ...; }`. Notes string also embeds `Customer:` and `Phone:` substrings at lines 1222–1223 (defensive duplication so the data survives even if the body fields are stripped). **No address field is added to the payload today.**
- **Submission path:** `placeOrderMutation` at lines **1243–1279**. Two paths:
  - With supervisor override (lines 1247–1265): direct `fetch("/api/orders", ...)` with the `orderData` body.
  - Default path (lines 1267–1278): `syncManager.enqueueOrder(orderData)` — offline-first queue. The sync manager treats the payload as `Record<string, unknown>` (`client/src/lib/sync-manager.ts:221`) and forwards it verbatim to `/api/orders` when online. **No field-level filtering**, so adding `deliveryAddress` to `orderData` propagates through both paths unchanged.

## Existing field wire-up pattern

`customerPhone` is the canonical example to mirror end-to-end. Five touch points across `client/src/pages/modules/pos.tsx`:

1. **Interface field declaration** (line 111): `customerPhone?: string;` on the `OrderTab` interface.
2. **Default initial value** (line 197): `customerPhone: "",` in the new-tab seed object.
3. **Render + edit** (line 2039): `<Input ... value={activeTab?.customerPhone ?? ""} onChange={e => updateActiveTab({ customerPhone: e.target.value })} ... />`. Updates flow through `updateActiveTab(patch)` which is the central tab mutator (defined ~line 405; merges `patch` into the active `OrderTab` and persists via `syncManager.saveActiveCart` for offline durability).
4. **Validation** (lines 1371–1374 inside `handlePlaceOrder`): `if (!activeTab?.customerPhone?.trim()) { toast({ title: "Customer phone required", ... variant: "destructive" }); return; }`.
5. **Payload field** (line 1237 inside `buildOrderData`): `orderData.customerPhone = tab.customerPhone?.trim() || null`.

M5 follows this pattern exactly, with one extra wrinkle (visibility): the address field is delivery-only, while customer-name/phone are non-dine-in (delivery + takeaway). So the visibility gate for M5 is `orderType === "delivery"`, narrower than the existing customer-fields block at line 2031 (`!isDineIn`).

**Phone-order parity.** `client/src/pages/modules/phone-order.tsx:461-474` is the canonical UI shape for the address field (verified, the only existing delivery-address input in the codebase):
- Label with `<MapPin>` icon: `"Delivery Address"` (line 464).
- Single-line `<Input>` (line 466–472), `placeholder="Enter delivery address..."`, `data-testid="input-delivery-address"`.
- Conditional render gated on `orderType === "delivery"` (line 461).
- State hook `const [deliveryAddress, setDeliveryAddress] = useState("")` (line 83).
- Reset on form clear: `setDeliveryAddress("")` (line 261).
- Submitted as `deliveryAddress: orderType === "delivery" ? deliveryAddress : null` in the POST /api/phone-orders body (line 230).

## Server-side acceptance

- **No Zod schema for POST /api/orders.** Grep `z\.object|zod|safeParse|parse(` against `server/routers/orders.ts` → zero hits. The handler at line 325 destructures `req.body` directly (line 333: `const { items, supervisorOverride, dismissedRuleIds, manualDiscountAmount, clientOrderId, ...orderData } = req.body;`) and treats everything else as part of `orderData`.
- **Unknown body fields propagate silently.** `orderData` is spread into `serverOrderData` at line 580. `serverOrderData` is then passed to `storage.createOrder(serverOrderData)` at line 597. Drizzle's `db.insert(orders).values(...)` will only persist columns it recognises; unknown keys are dropped at the ORM layer.
- **No `delivery_address` column on the `orders` table.** Confirmed by reading `shared/schema.ts:460-509` (orders schema). Columns include `customer_name`, `customer_phone`, `notes`, `order_type`, `channel`, etc., but not `delivery_address`.
- **Net effect today:** sending `deliveryAddress` in the POST /api/orders body has **zero observable effect** — it lands in `orderData`, then `serverOrderData`, then is silently discarded by Drizzle when inserting the order row. Safe to ship M5 in isolation; PR B will start reading it once it lands.
- **POST /api/phone-orders already accepts `deliveryAddress`** at `server/routers/service-coordination.ts:641` (destructured from `req.body`) and uses it at line 701 (`customerAddress: deliveryAddress` when calling `storage.createDeliveryOrder`). M5 brings the POS body to parity with this existing endpoint.

## Proposed implementation sketch

**One file changed:** `client/src/pages/modules/pos.tsx`. **Estimated diff: ~15–25 lines added across 5 touch points + locale-key additions.**

Touch points, mirroring the customerPhone pattern:

1. **OrderTab interface** (line 113, after `customerPhone?: string`): add `deliveryAddress?: string;`.
2. **New-tab seed** (after line 197 `customerPhone: ""`): add `deliveryAddress: "",`.
3. **Render the Input** — insert a third row inside the `motion.div` at lines 2031–2042 (or as a sibling motion.div), gated on `orderType === "delivery"` only. Sketch:
   ```
   {orderType === "delivery" && (
     <motion.div key="delivery-address" ... className="overflow-hidden">
       <div className="relative">
         <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
         <Input
           data-testid="input-delivery-address"
           placeholder="Delivery address"
           value={activeTab?.deliveryAddress ?? ""}
           onChange={e => updateActiveTab({ deliveryAddress: e.target.value })}
           className="pl-8 text-sm bg-background"
         />
       </div>
     </motion.div>
   )}
   ```
   - `MapPin` is already imported (used by the table picker at line 2016) — no new icon import.
   - Single-line `<Input>` matches phone-order parity. Full width (no grid wrapper) is the simplest layout that doesn't disturb the existing 2-col customer name/phone grid.
4. **Validation** — after the customerPhone check at line 1374 inside `handlePlaceOrder`, add:
   ```
   if (orderType === "delivery" && !activeTab?.deliveryAddress?.trim()) {
     toast({ title: "Delivery address required", description: "Please enter a delivery address for this order.", variant: "destructive" });
     return;
   }
   ```
5. **Payload field** — after line 1237 inside `buildOrderData`, add:
   ```
   if (tab.orderType === "delivery") {
     orderData.deliveryAddress = tab.deliveryAddress?.trim() || null;
   }
   ```
   Field name is `deliveryAddress` (matches POST /api/phone-orders body, sets up clean read for PR B).

**Body field name:** `deliveryAddress` — matches `server/routers/service-coordination.ts:641` (phone-orders endpoint) and `client/src/pages/modules/phone-order.tsx:230`. Keeps the two POS-equivalent surfaces (POS module + phone-order module) on the same body shape, which simplifies PR B (one read, not two field-name branches).

**Validation rule:** non-empty after `trim()`. Matches existing `customerName` / `customerPhone` rule at lines 1367–1374. No min-length, no character class, no normalization. Restaurant addresses are highly variable (apartment numbers, building names, landmarks) — over-validation on the client will reject legitimate input.

**Visibility:** delivery only (`orderType === "delivery"`), NOT takeaway. Takeaway is "customer comes to the store" — no address needed. Phone-order makes the same choice (line 461 gates on `orderType === "delivery"`).

**OrderTab persistence.** The existing `syncManager.saveActiveCart(posCartKey, updated)` calls inside the tab mutator (~lines 412, 426, 440, 451, 458) serialize the full `OrderTab` object. Adding `deliveryAddress` to the interface means it auto-persists alongside the other tab state — no change needed to the persistence layer. Same goes for `heldTabs[]` (line 115–119): held delivery tabs will retain the address through hold/recall.

## i18n / a11y notes

- **i18n system:** `react-i18next` via `useTranslation`. Two namespaces consumed by pos.tsx (line 328–329): `tc` from `"common"`, `tp` from `"pos"`. Locale files at `client/src/i18n/locales/{ar,en,es,fr}/pos.json` (~470 keys in en).
- **Existing convention is inconsistent.** The customer-name and customer-phone validation toasts at lines 1368, 1372 are **hardcoded English strings** ("Customer name required", "Customer phone required") — they do NOT use `tp(...)`. The `Customer name`/`Phone` placeholders at lines 2035, 2039 are also hardcoded. So strict parity = hardcode the new strings the same way. Cleaner long-term path = add translation keys.
- **Recommended approach:** add four new keys to `client/src/i18n/locales/en/pos.json`:
  - `"deliveryAddress": "Delivery address"` (Input placeholder)
  - `"deliveryAddressRequired": "Delivery address required"` (toast title)
  - `"enterDeliveryAddress": "Please enter a delivery address for this order."` (toast description)
  - Optionally `"deliveryAddressLabel": "Delivery Address"` (if a `<Label>` is added above the Input).

  Then ar/es/fr files get the same keys, prefixed `[EN]` per the project's no-machine-translate convention used by recent fixes (M1, M3 — see `docs/audits/bug-inventory.md` FIXED tables, where each shipped feature noted "es/fr/ar `[EN]` prefixed").
- **a11y:** the existing customer-name and customer-phone Inputs at lines 2035, 2039 don't have explicit `<Label>` elements — they use placeholder text only. A11y-stricter pattern would add `<label htmlFor="...">` wrappers, but matching the existing inconsistency for a one-field UI change is acceptable. The `data-testid="input-delivery-address"` attribute is required (matches phone-order convention; needed for any future Playwright assertion).
- **No keyboard-shortcut conflicts identified.** The POS module has a few keyboard handlers (search focus, etc.) but none on the customer-fields block.

## Open questions

- **QQ-1 — Body field name: `deliveryAddress` or `customerAddress`.** Phone-orders body uses `deliveryAddress`. The DB column is `customer_address`. PR B's recon doc currently assumes the body field is `deliveryAddress` (matches phone-order). Recommendation: `deliveryAddress` — it's two existing precedents to one. If product wants DB-column parity instead, change PR B's recon to read `req.body.customerAddress` and update phone-order in a separate consistency PR. No blocker either way; pick one and stick.
- **QQ-2 — i18n now or later.** Adding 4 keys × 4 locales = 16 strings touched. The existing customer-name/phone toasts are hardcoded English, so ship-with-hardcoded matches existing inconsistency and keeps the M5 diff small (~5 fewer files). Translation cleanup can be a separate sweep PR. Recommendation: hardcode for M5; flag as a follow-up.
- **QQ-3 — Held-tab address persistence.** Confirmed by reading: `syncManager.saveActiveCart` serializes the entire `OrderTab`, and `heldTabs[]` carries the full `OrderTab`. No code change needed. Documented here for reviewer reassurance.
- **QQ-4 — Edit on recalled orders.** When a held delivery order is recalled (lines 1140+), does the address need to be repopulated from a server-stored value? Today, held orders persist client-side only (held in `heldTabs[]` state, syncManager localStorage). Held tab → cleared → new session loses the held tab. Server-stored "on-hold" orders (status `on_hold` from phone orders) DO have a `delivery_orders` row already. M5 doesn't change recall semantics; this is informational.
- **QQ-5 — Server-side validation.** Should POST /api/orders also enforce non-empty `deliveryAddress` for delivery orders, matching the customer-name/phone enforcement at `server/routers/orders.ts:392-406`? Not strictly needed for M5 (client validates), but a defense-in-depth change. Recommendation: defer to PR B — PR B will be reading `deliveryAddress` anyway, and adding a 400-on-missing check is a 3-line natural extension. Marking as out of scope for M5.
- **QQ-6 — Single-line Input vs Textarea.** Phone-order uses `<Input>` (single-line). POS could use `<Textarea>` for multi-line addresses (apartment + building + landmark on separate lines). Recommendation: match phone-order single-line for consistency. Restaurant staff entering an address verbally over a phone call rarely need formatting; addresses can include commas/pipes for separators inside a single line. Single line keeps the layout compact on the POS-tab right rail.
- **QQ-7 — Customer profile prefill.** When the `customerPhone` field is filled and matches an existing `customers` record (CRM lookup), should the address be auto-filled from the customer profile? `customers` table has fields for stored addresses; this would be a net-new "phone → CRM lookup" capability that doesn't exist in POS today. **Out of scope for M5** — flag as a follow-up enhancement.

## Out of scope for M5

- **Address autocomplete.** Google Places, Mapbox, or similar geocoding-backed suggestion APIs. Adds external dependency, API key management, billing surface. Separate ticket if/when product wants it.
- **Address normalization.** Standardising "St" / "Street" / "Str.", title-casing, postal-code validation. Adds complexity for marginal data quality gain.
- **Multi-line / structured address.** Splitting into Street / Building / City / Postal Code / Country fields. Heavier UI; restaurant deliveries are typically same-city short-radius and don't benefit from full international address structure.
- **Geocoding / map preview.** Showing a pin or radius on a map. Belongs to a delivery-zones / delivery-fee-by-distance PR if/when product wants distance-based pricing.
- **Recent-address history per phone number.** Auto-suggesting addresses previously used for the same `customerPhone`. Belongs to QQ-7's CRM-prefill enhancement.
- **Server-side validation enforcement** (QQ-5). Defer to PR B.
- **Locale-correct translation keys** (QQ-2). Defer to a documentation/translation sweep PR if hardcoded English ships.

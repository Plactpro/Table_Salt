# F-247 Phase 3 — Decision memo (2026-05-04)

Read-only design memo. Locks the fix shape so the Phase 4 prompt can
be derived without further design work.

Prerequisites in context:
- `audit/f247-phase1-static-investigation-2026-05-04.md` — scope bug.
- `audit/f247-phase2-prod-recon-2026-05-04.md` — bills exist for
  today's orders; the active failure is the JSX scope error alone.

The problem: `client/src/components/pos/BillPreviewModal.tsx:2150-2160`
references `qrDataUrl` and `digitalReceiptUrl` in JSX at component-
body scope, but both are declared inside the `handlePrint`
`useCallback` at `:723-739`. ReferenceError on every render that
reaches the action-button section.

---

## Q1 — Lift mechanism

### Recommendation

**(a) `useState<string | null>(null)` for both `qrDataUrl` and
`digitalReceiptUrl`** at the top of `BillPreviewModal`'s body.

### Reasoning

JSX needs a value the component is aware of. State is the React-
native way to surface async-derived strings. Re-render cost is one
commit per generation — negligible for an 80×80 base64 PNG.

The `// O7` comment at `:732` justifies pre-generating the QR data
URL specifically so it's available "in print contexts (external
API fetches fail or load too late during printing)". State at
component scope satisfies that intent better than the current
function-local declaration: the QR exists before the user clicks
Print, not only after.

### Alternatives considered

- **(b) `useRef<string | null>`**: rejected. Mutating `.current`
  does not trigger a re-render, so the JSX guard at `:2150` would
  evaluate against stale `null` forever. Defeats the display
  purpose entirely.
- **(c) `useMemo` derived synchronously from `createdBill`**:
  rejected. `QRCode.toDataURL` is async (returns a Promise);
  `useMemo` cannot await it. Rewriting to a sync QR encoder would
  enlarge scope and lose the existing `qrcode` library's well-
  tested base64 output.

### Citations

- `BillPreviewModal.tsx:723-739, 2150-2160, 732` (`// O7` comment).

---

## Q2 — `useEffect` for async generation

### Recommendation

Add a single `useEffect` at component-body scope, watching
`createdBill?.id`:

- **Initial state**: `qrDataUrl = null`, `digitalReceiptUrl = null`.
- **Dependency**: `[createdBill?.id]`. `window.location.origin` is
  effectively constant for the page's lifetime.
- **Behavior**: when `createdBill?.id` becomes truthy, compute the
  receipt URL (`${window.location.origin}/receipt/${createdBill.id}`),
  call `setDigitalReceiptUrl(url)`, then `await QRCode.toDataURL(url, ...)`,
  then `setQrDataUrl(dataUrl)`. When `createdBill?.id` becomes
  falsy, reset both to `null`.
- **Cleanup**: a `cancelled` flag — `let cancelled = false;` at
  effect entry, `return () => { cancelled = true; }`, and skip
  both setters if `cancelled` is true. `QRCode.toDataURL` has no
  abort handle, but the flag prevents stale writes from a
  superseded generation.
- **handlePrint behavior**: keep its existing local generation
  unchanged. It is the print-context defensive backup the `// O7`
  comment describes; removing it would couple print correctness to
  the new effect's timing. The two paths produce the same value
  (both derive from `createdBill.id`) and are idempotent.

### Citations

- `BillPreviewModal.tsx:728-739` — current local generation logic
  (template for the effect body).
- `BillPreviewModal.tsx:801` — `qrDataUrl` passed into
  `renderBillHtml` payload (unchanged by this fix).

---

## Q3 — Dependency-array implications

### Finding

`handlePrint` is a `useCallback` whose deps array is at
`BillPreviewModal.tsx:831-837`:

```
}, [
  billNumber, createdBill, orderId, orderType, tableNumber, cart,
  subtotal, discountAmount, tierDiscountAmount, serviceChargeAmount,
  taxAmount, taxRate, grandTotal, tipAmount, activeMethod,
  lookedUpCustomer, customerGstinInput, isGSTTenant,
  tenantName, tenantAddress, user,
]);
```

Neither `qrDataUrl` nor `digitalReceiptUrl` is currently listed —
correctly, because both are function-local in the current code.

### Recommendation

**No change to `handlePrint`'s dependency array.** The recommendation
in Q2 keeps `handlePrint`'s local generation untouched. The names
inside the callback continue to refer to the same function-local
`let`/`const` they always have. The new component-state names are
distinct values living at component-body scope, read by the JSX
only.

If a future cleanup pass collapses the duplication (callback uses
state, deletes its local generation), then both names must be
added to the deps array. Out of scope for the F-247 fix.

### Citations

- `BillPreviewModal.tsx:723` (callback start) and `:831-837` (deps).

---

## Q4 — Test plan

### Pre-fix reproduction

1. Open the app, log in.
2. Open DevTools → Console + Network tabs.
3. From the Orders module (`/orders`), click any paid dine-in
   order to open the detail panel.
4. Click "View Bill / Refund".
5. **Expected current failure**: Console shows
   `ReferenceError: qrDataUrl is not defined` originating in
   `BillPreviewModal`. The bill view page renders incompletely or
   shows the app's "Something went wrong" boundary. A
   `GET /api/restaurant-bills/by-order/:orderId` 404 may flash in
   Network before the auto-create useEffect would have fired.

### Post-fix success state

Same five steps. Pass criteria:

- No `ReferenceError` in Console.
- The bill preview panel renders fully — items, totals, action
  buttons (Print / WhatsApp / Email / Download PDF), and the QR
  receipt block at `:2150-2160` once `createdBill` resolves
  (typically <300 ms after mount).
- The QR image is visible and scannable. Right-click → "Open image
  in new tab" should yield a base64 PNG.
- Clicking "Copy link" copies the digital-receipt URL to the
  clipboard.

### Regression check — print flow still works

The `// O7` print-time pre-generation must remain functional.

1. From POS, complete a fresh dine-in order: pick a free table,
   add 2 items, Send to Kitchen, then Bill → Cash → confirm.
2. In the post-payment receipt view, click Print.
3. Pass criteria: print preview/job opens; the bill HTML payload
   delivered to the printer includes a non-empty `qrDataUrl` /
   `digitalReceiptUrl`. Visual: the printed receipt shows the QR
   block. (If the printer is offline, the print job is queued and
   the operator can inspect its `payload.qrDataUrl` via a
   TablePlus `SELECT payload FROM print_jobs WHERE id = ...`
   read-only.)

### Edge case — bill not yet created

If the bill view page loads for an order with no bill row yet
(per F-250, this is rare but possible), the auto-create
`useEffect` at `BillPreviewModal.tsx:448-453` should still fire
after the fix because the render no longer crashes. Pass
criterion: a `POST /api/restaurant-bills` request appears in the
Network tab and returns 200; the QR appears once `createdBill.id`
populates from the response.

### Citations

- `BillPreviewModal.tsx:448-453` — auto-create useEffect.
- `BillPreviewModal.tsx:2150-2160` — JSX block under test.
- `audit/f247-phase2-prod-recon-2026-05-04.md` — confirms today's
  orders have bill rows, so primary path exercises the
  bill-already-exists branch.

---

## Locked Decisions (Phase 4 reference)

| ID | Decision |
|---|---|
| D1 — Lift mechanism | `useState<string \| null>(null)` for `qrDataUrl` and `digitalReceiptUrl` at the top of `BillPreviewModal`'s body |
| D2 — Async generator | New `useEffect` watching `[createdBill?.id]`; computes URL, calls both setters; uses a `cancelled` flag for cleanup |
| D3 — handlePrint | Untouched. Keeps its function-local generation as the print-context defensive backup |
| D4 — Deps array | No change to `handlePrint`'s deps (both new names live at component scope, not closed over by the callback) |
| D5 — JSX | `:2150-2160` and `:2156` now read the new state names with no other change required |
| D6 — Verification | Pre-fix repro via `/orders` → "View Bill / Refund"; post-fix success = no ReferenceError + visible QR; regression check via fresh POS payment + Print |
| D7 — Scope | Single-file change in `client/src/components/pos/BillPreviewModal.tsx`. No server change. No migration. No schema. No test infra. |

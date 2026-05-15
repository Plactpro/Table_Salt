# F-294 follow-up — `/pos/bill/:orderId` navigation trace

**Date:** 2026-05-14
**Branch:** main (read-only investigation, no code changes)
**Trigger:** After F-294 Phase 3 manual testing, the tester reported being unable to reach `/pos/bill/:orderId` from the UI. This trace answers whether a path exists, and if so, what gates it.

## Verdict — short form

**(b) There IS a path, but it is gated by order status — specifically, the order must reach `ready_to_pay` before the discoverable "View Bill" buttons appear.** The route is registered and reachable from at least four distinct UI surfaces, but every persistent surface (Orders list row, order detail dialog) requires `status === "ready_to_pay"`. The two surfaces that work for pre-ready_to_pay orders are ephemeral (the lastPlacedOrder banner, which dies on page reload) or keyboard-only (Ctrl+B / B). This is essentially the same bug previously filed as F-268 — which was marked CLOSED on 2026-05-10 as "not reproducible by tester sweep." The tester's current report suggests F-268 should be re-opened.

---

## 1. Route registration [VERIFIED]

**File:** `client/src/App.tsx`

- L61 — lazy import:
  ```
  const BillViewPage = lazy(() => import("@/pages/pos/bill-view"));
  ```
- L573 — route declaration:
  ```
  <Route path="/pos/bill/:orderId">{() => <GuardedRoute path="/pos" component={BillViewPage} />}</Route>
  ```

The route is registered. It is wrapped in `<GuardedRoute path="/pos" ...>`, which (judging by the prop pattern) applies the same role/permission gate as the rest of `/pos`. The route is NOT orphaned at the router level.

---

## 2. Every `navigate()` to `/pos/bill/:orderId` [VERIFIED]

Six call sites found across two files:

### 2.1 `client/src/pages/modules/orders.tsx` — three sites

| Line | Surface | Condition |
|---|---|---|
| 286 | `handleBillPreview(orderId)` helper — just wraps `navigate()` | Called from L416 and L595 (both gated on `ready_to_pay`) |
| 606 | Detail dialog "View Bill / Refund" button (`data-testid="button-view-bill"`) | `selectedOrderDetail.status === "paid"` OR `=== "completed"` (L604) |
| 629 | Detail dialog "Void Bill" button (`data-testid="button-void-order"`) | status NOT in `{cancelled, voided, paid, completed}` AND `isManagerOrOwner` (L626, L628) |

Plus a **fourth orders.tsx surface** that calls `handleBillPreview` rather than `navigate` directly:
| Line | Surface | Condition |
|---|---|---|
| 416 | **Per-row Bill icon** in Orders table (`data-testid="button-bill-preview-${orderId}"`) | `isReadyToPay` — i.e. `order.status === "ready_to_pay"` (L384, L415) |
| 595 | Detail dialog "View Bill and Settle" button (`data-testid="button-view-bill"`) | `selectedOrderDetail.status === "ready_to_pay"` (L594) |

### 2.2 `client/src/pages/modules/pos.tsx` — three sites

| Line | Surface | Condition |
|---|---|---|
| 1596 | **Ctrl+B keyboard shortcut** | `billOrderId = activeTab?.heldOrderId \|\| lastPlacedOrder?.orderId` is truthy |
| 1623 | **Plain `b` keyboard shortcut** | `cart.length > 0` AND `billOrderId` truthy AND NOT inside an input AND `!showBillModal` |
| 2077 | **"Bill" button on lastPlacedOrder banner** (`data-testid="button-open-bill"`) | `lastPlacedOrder` truthy AND `lastPlacedOrder?.tableId` truthy (dine-in only) |

---

## 3. The POS cart panel — no Bill button while building or after sending [VERIFIED]

There is no Bill / View Bill / Pay button rendered alongside the live POS cart's "Hold" / "Send to Kitchen" / "Send Add-on KOT" actions. While the cashier is building or holding an order — i.e. status is null/cart-only, `sent_to_kitchen`, `in_progress`, `ready`, or `served` — the POS page has only one in-page entry to `/pos/bill`:

- **The lastPlacedOrder banner** at `pos.tsx:2050-2082`. Renders only when local state `lastPlacedOrder` is truthy (set at `pos.tsx:1319` in the place-order success handler). The banner's Bill button (L2077) navigates to `/pos/bill/${lastPlacedOrder.orderId}` for dine-in orders.

**Why the tester likely could not find it:**
- `lastPlacedOrder` is **local component state** (`useState` at `pos.tsx:374`), not persisted. The banner appears only in the same browser session as the place-order action.
- It is dismissable: the X button at `pos.tsx:2081` calls `setLastPlacedOrder(null)`, removing the banner permanently for that session.
- On page reload, navigate-away-and-back, or new browser tab, the banner is gone — and so is the only persistent in-POS UI path to `/pos/bill/:orderId` for orders that have not yet reached `ready_to_pay`.

The keyboard shortcuts (Ctrl+B, plain B) work, but rely on the cashier knowing they exist. The `[B]` glyph next to the banner button is a hint, but only visible while the banner is.

---

## 4. The Orders list — Bill action only on `ready_to_pay` rows [VERIFIED]

**File:** `client/src/pages/modules/orders.tsx`

### Per-row actions (L411-425)
For each row in the Orders table:
- L412-414 — Eye icon (view detail) — always rendered.
- L415-419 — **Bill icon — rendered ONLY when `isReadyToPay`** (i.e. `order.status === "ready_to_pay"`). For any other status this button is not in the DOM.
- L420-424 — Advance "→" icon — rendered when `NEXT_STATUS[status]` exists AND not `ready_to_pay` AND `canUpdateStatus` (a role/permission gate).

### Detail dialog actions (L587-637)
Visible after clicking the Eye icon, when `canUpdateStatus` is true (L587). Status-specific buttons:
- **L589-592** "Mark Ready to Pay" — visible **only when `status === "served"`**.
- **L594-597** "View Bill and Settle" — visible only when `status === "ready_to_pay"`.
- **L599-602** Generic "Advance to ..." — visible for any status with a next step, except `served` and `ready_to_pay` (those have their own buttons above).
- **L604-624** "View Bill / Refund" + "Reprint Receipt" — visible only when `status === "paid"` or `"completed"`.
- **L626-636** "Void Bill" + "Cancel Order" — visible for non-terminal statuses; Void Bill is manager/owner only.

### Status flow (L58-64 of orders.tsx)
```
new → sent_to_kitchen → in_progress → ready → served → ready_to_pay → paid
```

The only ways to reach `ready_to_pay`:
1. **Manual via detail dialog:** open order → wait until status is `served` → click "Mark Ready to Pay" (L590).
2. **Sequential via Advance button:** click "→" on the row (or the "Advance to ..." button in the dialog) repeatedly. Each click advances one step. Once the row reaches `served`, the Advance button stops appearing per the L420 condition (`!isReadyToPay`) actually — wait, L420 says `!isReadyToPay`, meaning the Advance button shows for everything except already-ready-to-pay. So `served → ready_to_pay` IS reachable via the row's Advance button.

**Net:** a dine-in order placed via POS must transition through five statuses (or be advanced manually) before the per-row Bill icon appears. The cashier sees no Bill action on the order in the list until that point.

---

## 5. Ticket History — separate surface, uses a drawer (not the bill page) [VERIFIED]

`client/src/pages/tickets/index.tsx` exists as the ticket history page. The tester's note that "the View button opens a ticket drawer, not the bill page" is consistent with the F-285 evidence (the `TicketDetailDrawer` component, referenced indirectly via the type-error in `client/src/components/tickets/TicketDetailDrawer.tsx:348`). Ticket History is the past-orders/closed-bills archive, not an active-order bill flow, and it does NOT navigate to `/pos/bill/:orderId`.

---

## 6. Verdict — long form

**(b) There IS a path, but it is gated.**

The most-discoverable paths require the order to reach `status === "ready_to_pay"`:
- Orders list row Bill icon (L416 of orders.tsx)
- Orders detail dialog "View Bill and Settle" button (L595)
- After payment: "View Bill / Refund" button for paid/completed orders (L606)

The pre-`ready_to_pay` paths are ephemeral or non-obvious:
- **lastPlacedOrder banner Bill button** (pos.tsx:2077) — works for dine-in but dies on page reload; only visible immediately after placing the order in the same session.
- **Ctrl+B keyboard shortcut** (pos.tsx:1596) — works any time there's a held order or last-placed order; not discoverable.
- **Plain `B` keyboard shortcut** (pos.tsx:1619-1626) — works only when the cart has items AND not inside an input; not discoverable.

**To reach `/pos/bill/:orderId` for a freshly placed dine-in order, the cashier must either:**
1. Use the post-place banner (works in the same session only, before dismissing); or
2. Navigate to Orders list, drill into the order's detail dialog, advance status (or wait for it to advance) until `served`, click "Mark Ready to Pay", then click "View Bill and Settle"; or
3. Know and use a keyboard shortcut.

**Cross-reference F-268:** This is the same shape as F-268 ("View Bill navigation diverges by order state, blocking dine-in workflow"), which was marked CLOSED 2026-05-10 as "not reproducible by tester sweep." The tester's current finding suggests F-268's CLOSED status was premature — same root behaviour, same operational impact. Re-opening F-268 (or filing a new finding referencing it) is appropriate.

**This is independent of F-294.** F-294 is about WHAT data is sent when `/pos/bill/:orderId` finalizes a bill (specifically `pos_session_id`). The current trace is about HOW a cashier reaches that route. F-294's fix in `bill-view.tsx` was correct and necessary — but it can only be tester-verified if the cashier can navigate there in the first place. The two findings compose: F-294 is the data correctness, F-268 (re-opened) is the navigation discoverability.

---

## 7. Recommended next actions (no code changes in this trace)

1. **Re-open F-268** in `audit/00-backlog.md` BLOCKING section with this trace cited. The original CLOSED reason ("not reproducible") was wrong — the bug reproduces, the question is whether it was the same surface the original tester used.
2. **For F-294 tester verification today:** instruct the tester to use the lastPlacedOrder banner Bill button immediately after placing a dine-in order (without dismissing), OR walk the order through status `served → ready_to_pay` via the detail dialog. Either path will land on `/pos/bill/:orderId` and allow F-294 verification.
3. **F-268 Phase 1 (separate work, separate branch):** the UX fix space is broad — options include surfacing a Bill button on every dine-in order row (not just `ready_to_pay`), with status-aware behaviour (greyed out / "Mark Ready to Pay" inline shortcut for pre-ready orders); persisting the lastPlacedOrder banner across reloads via a query against active orders; or restructuring the status flow to make the cashier's "I want to bill this table" action one click from the row. Out of scope for this trace.

---

## 8. Open questions

- **What is `canUpdateStatus`?** Not investigated in detail — appears at `orders.tsx:587` and `:420` gating the manual status-transition buttons. Likely a role/permission check (waiter vs. cashier vs. manager). If the tester's role does not have `canUpdateStatus`, even the "Mark Ready to Pay" path is closed to them. Worth confirming with the tester what role their test account uses. [HYPOTHESIS — would need to read `useAuth`/permission code to confirm.]
- **What is `GuardedRoute path="/pos"`?** Wraps `BillViewPage` at App.tsx:573. If the tester's role does not have access to `/pos`, the route would refuse to render or redirect — but they reported a tickets drawer, not an access-denied page, so this is probably not the blocker. [UNVERIFIED.]
- **Does the order ever auto-advance to `ready_to_pay`?** The KDS "Serve" action transitions to `served`, but the `served → ready_to_pay` step appears to be manual (the dedicated `markReadyToPay` button at L590). For a single-cashier-single-waiter flow this is friction — the cashier must perform an extra action before any bill action is reachable. Worth confirming whether this is intentional design or oversight. [UNVERIFIED.]

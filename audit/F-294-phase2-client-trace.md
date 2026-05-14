# F-294 Phase 2 — Client-side `posSessionId` Drop Point Trace

**Date:** 2026-05-14
**Branch:** `investigate/F-294-possessionid-client-drop`
**Scope:** Read-only investigation. Phase 1 narrowed root cause to "client sends `posSessionId: null` in the bill-finalize POST." Phase 2 identifies the exact client-side drop point.
**Outcome:** Drop point found at `client/src/pages/pos/bill-view.tsx:94`. Category (a) — bill-finalize reads from a different state location than where shift-open wrote it.

---

## 1. Shift open — where the session id originates [VERIFIED]

**Endpoint call:** `client/src/components/pos/PosSessionModal.tsx:49`
```
const res = await apiRequest("POST", "/api/pos/session/open", { openingFloat, shiftName });
```

**Response field name:** the server returns a session object with `.id`. Read at `PosSessionModal.tsx:58`:
```
onSuccess: (session) => { onSessionStarted(session.id); }
```

The session id is handed back to the parent via the `onSessionStarted: (sessionId: string) => void` prop callback (`PosSessionModal.tsx:18`). `StartShiftModal` itself does NOT store the id — it pushes it up to whoever mounted it.

---

## 2. Storage — where the id lives client-side [VERIFIED]

**Sole storage location:** local `useState` inside `client/src/pages/modules/pos.tsx`.

`pos.tsx:368-370`:
```
const [posSessionId, setPosSessionId] = useState<string | null>(null);
const posCartKey = userOutletId ? `pos_cart_${userOutletId}_${posSessionId ?? "default"}` : null;
const [posSession, setPosSession] = useState<{ id; shiftName; openedAt } | null>(null);
```

**Not in:** React context, localStorage, sessionStorage, IndexedDB, or any shared cache. Just component-local state on the POS page component.

**Two setter paths populate this state:**

1. **On Start Shift modal success** — `pos.tsx:2854-2858`. `<StartShiftModal onSessionStarted={(sessionId) => { setPosSessionId(sessionId); ... }} />` — when the user opens a shift via the modal, the callback writes the new session id into state.

2. **On page mount, from existing active session** — `pos.tsx:752-772`. A `useQuery` against `GET /api/pos/session` fetches the active session (if one already exists); a `useEffect` then hydrates state:
```
if (activeSessionData) {
  setPosSessionId(activeSessionData.id);
  setPosSession(activeSessionData);
  setShowStartShift(false);
} else {
  setPosSessionId(null);
  ...
}
```

**State clears:** at shift close (`pos.tsx:2861` `onClosed: () => { setPosSessionId(null); ... }`).

This storage works correctly in isolation — by the time the user is doing POS work on the `pos.tsx` page, `posSessionId` holds the active session id.

---

## 3. Read sites — where the id is consumed [VERIFIED]

**In `pos.tsx`:**
- `:369` — cart cache key composition (`pos_cart_${outletId}_${posSessionId}`)
- `:2026` — conditional UI render on whether a session is active
- `:2846` — passed as prop to `<BillPreviewModal posSessionId={posSessionId || undefined} ... />`
- `:2860` — passed as `sessionId` prop to `<CloseShiftDialog ... />`

**In `BillPreviewModal.tsx`:**
- `:59` — prop interface declaration (`posSessionId?: string`)
- `:124` — destructured from props
- `:563` — placed into the bill-finalize POST body
- `:2407` — forwarded as prop to a nested child component

**In `bill-view.tsx`:**
- `:94` — passed as prop to `<BillPreviewModal posSessionId={undefined} ... />` (literal `undefined`, see §5).

**Other files matched** (`CashPaymentModal.tsx`): no bill-finalize call — only `POST /api/restaurant-bills/{billId}/payments` against an already-created bill. Not relevant to F-294.

---

## 4. Bill finalize — where the id enters the POST body [VERIFIED]

**Endpoint call:** `client/src/components/pos/BillPreviewModal.tsx:551`
```
const res = await apiRequest("POST", "/api/restaurant-bills", {
  orderId, tableId, customerId, subtotal, discountAmount, serviceCharge,
  taxAmount, taxBreakdown, tips, totalAmount, parkingCharge,
  posSessionId: posSessionId || null,    // <-- :563
  customerGstin,
});
```

The value sent is `posSessionId || null`. The `posSessionId` identifier on the right-hand side is the **prop** destructured at `BillPreviewModal.tsx:124` — sourced entirely from whatever the parent component passes.

`BillPreviewModal` itself does not query `/api/pos/session`, does not read from any store, and has no fallback. If the prop is `undefined` or `null` at mount time, the POST body lands as `null`.

---

## 5. The drop — bill-view mounts BillPreviewModal with `posSessionId={undefined}` [VERIFIED]

**Drop site:** `client/src/pages/pos/bill-view.tsx:94`

```
<BillPreviewModal
  open={true}
  ...
  orderId={order.id}
  posSessionId={undefined}    // <-- hardcoded
  onPaymentComplete={() => navigate("/orders")}
  fullPage={true}
/>
```

**What `bill-view.tsx` does:** renders the route `/pos/bill/:orderId`. It fetches `GET /api/orders/{orderId}` (`:18-26`), fetches `GET /api/tables` (`:28`), then mounts `BillPreviewModal` as a full-page surface. **It does NOT fetch `GET /api/pos/session`** and has no other access to the POS session state — the entire `posSessionId` state lives inside `pos.tsx`'s local `useState`, which is a separate, sibling route component.

**Confirmation that this is the production drop:**
- F-294's symptom: 49 of 49 production bills since 2026-05-10 have `bills.pos_session_id = NULL`.
- `bill-view.tsx` is reached when a user clicks "View Bill" from the Orders list or navigates directly to `/pos/bill/:orderId`. This is the dominant cashier flow for completing payment on existing dine-in orders.
- Every bill-creation POST originating from this route will send `posSessionId: null` regardless of whether the user has an open shift, because the prop value is literally the keyword `undefined` at the JSX boundary, not a state lookup.

**Why the OTHER bill-creation surface is NOT (alone) responsible:** `pos.tsx:2846` mounts `BillPreviewModal` with `posSessionId={posSessionId || undefined}` from local state. That state IS hydrated correctly by §2's two setter paths. The pos.tsx-inline modal path appears structurally correct. [HYPOTHESIS — would need end-to-end testing to confirm pos.tsx-inline modal path actually persists `pos_session_id` in production. The 100% NULL rate is consistent with either (i) the bill-view path being the dominant traffic source, or (ii) both paths being broken. The bill-view path is definitively broken; the pos.tsx-inline path is the open question.]

---

## 6. Drop category

**Category (a) — bill-finalize reads from a different state location than where shift-open wrote it.**

The `posSessionId` value is written to `pos.tsx` component-local `useState`. `BillPreviewModal` reads it from its `posSessionId` prop. When mounted from `pos.tsx`, the prop sources from the correct state. When mounted from `bill-view.tsx`, the prop sources from the literal `undefined` — `bill-view.tsx` is in a different component tree and has no access to `pos.tsx`'s local state, and it never queries the session endpoint to recover the value.

Categories (b), (c), (d) ruled out:
- **(b) different key/name:** the name is consistent — `posSessionId` everywhere on the client.
- **(c) cleared/reset between shift-open and bill-finalize:** the state is cleared only at shift-close. There is no path that nulls it during normal bill flow.
- **(d) stale closure / render-timing:** the `useQuery` + `useEffect` hydration is straightforward; no stale-closure pattern observed in the read path.

---

## 7. Recommended fix approach for Phase 3 (describe only, do not implement)

**Recommended: Option A — read the active session in `bill-view.tsx` and pass it through.**

`bill-view.tsx` should add the same `useQuery` against `/api/pos/session` that `pos.tsx:752-757` uses, and pass the result down:

```
// proposed shape — DO NOT IMPLEMENT in Phase 2
const { data: activeSession } = useQuery<{ id: string } | null>({
  queryKey: ["/api/pos/session"],
  queryFn: async () => (await apiRequest("GET", "/api/pos/session")).json(),
  staleTime: 60_000,
});
// then:
posSessionId={activeSession?.id ?? undefined}
```

**Why this is the right shape:**
- Smallest change: ~5-7 lines in one file (`bill-view.tsx`).
- Matches the existing pattern in `pos.tsx` — same query key (`/api/pos/session`), so the React Query cache deduplicates the request.
- No server changes, no schema changes, no API surface change.
- Preserves the `BillPreviewModal` prop-driven contract — the modal stays a "dumb" component that doesn't know about session storage.

**Considered and not recommended:**

- **Option B — `BillPreviewModal` fetches the session itself when the prop is missing.** Centralizes the recovery but couples the modal to the session endpoint. Adds network traffic on every modal mount (e.g., for `pos.tsx`-inline path the modal would re-fetch even though `pos.tsx` already has the session). Query-cache deduplication mitigates the cost but the design point is poorer — the modal becomes opinionated about session state rather than receiving it as data.

- **Option C — server-side: derive `pos_session_id` at the bill-creation endpoint from the user's active shift.** The most defensive fix (a missing client field can never break it), but reaches beyond Phase 2's scope and has correctness questions: what if a user has multiple outlets with multiple active sessions? what if a manager (no shift) creates a bill for a cashier? what about Razorpay-finalize / kiosk paths? Defer to a separate post-launch architectural finding. Worth filing as a follow-up regardless of which client-side fix lands.

**Suggested PR shape for Phase 3:**
1. Branch: `fix/F-294-bill-view-session-prop`.
2. One file edit: `client/src/pages/pos/bill-view.tsx` — add the `useQuery`, change `posSessionId={undefined}` to `posSessionId={activeSession?.id ?? undefined}`.
3. Manual test plan: with an open shift, navigate to `/pos/bill/:orderId` from the Orders list, complete a cash payment, query the database for the newly-created bill, confirm `pos_session_id` is populated.
4. After Phase 3 lands, run F-285 re-verification (the testers' Tier III workbook on PR #45's reader-side fix) — `bills.pos_session_id` now populated should make the shift-close cash aggregation work end-to-end.

---

## 8. Open questions for Phase 3 / follow-up

- **Does the pos.tsx-inline modal path actually persist `pos_session_id`?** [UNVERIFIED] Static reading suggests yes; the 100% NULL production data does not rule it out (could be that all production traffic flows through bill-view). Worth confirming with a targeted DB query after Phase 3 ships: create a bill via the `pos.tsx`-inline modal (place an order → see Bill Preview popup → complete payment), then check `pos_session_id` on that bill row.
- **Are there other bill-creation surfaces not covered by this trace?** [UNVERIFIED] The grep found 4 files referencing `posSessionId`; only `pos.tsx` and `bill-view.tsx` host bill-creation. Razorpay-finalize (server-side path at `server/routers/restaurant-billing.ts:62/76`) and kiosk/Stripe (`server/routers/billing.ts:258-294`, noted in F-286 Q-286-Q6) may create bills via a different client surface or server-derived. These are out of scope for the F-294 client-drop trace but should be checked as part of Option C's design.
- **Should server-side defense be filed regardless?** Yes — even after the client fix lands, a missing `pos_session_id` from any future bill-creation entry point would silently re-introduce F-294 with no visible symptom until shift-close verification fails. Recommend filing a follow-up to add a server-side check (warning log at minimum, or required field) once the client paths are stable.

# F-233 Monday static trace — 2026-05-04

Investigation of two failures reported by UI verifier against Friday's
F-233 fix attempt (commit 434240a, reverted in 741c6ea).

## Failures under investigation

- **Failure A**: After clicking Send to Kitchen on a fresh dine-in order
  (T7), the active tab automatically switched to a different tab (T88888)
  without any user click.
- **Failure B**: After Failure A, clicking back on the original T7 tab
  navigated the browser to `/` (Dashboard) instead of staying in `/pos`
  with the order loaded.

Code under trace: current branch `main` (post-revert). The reverted F-233
fix only altered the placement of the Bill button — it did not touch
`activeTabId`, `tabs[]`, or any navigation that would land on `/`.

---

## Path 1 — Tab-bar onClick handler

### What I found

The tab-bar tab is rendered at `client/src/pages/modules/pos.tsx:1911-1923`.
The onClick is purely a state setter:

```
1912:              <div key={tab.id} className={`flex shrink-0 items-center gap-1 ...`}
1913:                onClick={() => setActiveTabId(tab.id)}
1914:                data-testid={`pos-tab-${idx}`}
```

The X (close) sub-button at `pos.tsx:1919` calls `e.stopPropagation()`,
so the close path cannot bubble into a navigate.

There is **no `useEffect` watching `activeTabId` that navigates**. Every
`useEffect` in the file with `activeTabId` in its dep array only resets
local UI state:

```
571:  useEffect(() => { setDiscountPreset("none"); }, [activeTabId]);
```

That is the only one. No other effect closes over `activeTabId` for a
navigate.

The `navigate` (wouter `useLocation`) hook is bound at `pos.tsx:344`. All
explicit `navigate(...)` calls in this file (`pos.tsx:1511`, `1538`,
`1931`, `1992`, `2387`) target `/pos/bill/:id`, `/tickets`, or `/tables`
— **none target `/`**. A grep across `client/src` confirms no
`navigate("/")` in `pos.tsx` or `BillPreviewModal.tsx`.

### Confidence: HIGH

The onClick is one line, static, and self-contained. The dep-array of
every `activeTabId` effect was inspected.

### Verdict
- Could explain Failure A: **No** — onClick fires only on user click; it
  is not a side effect of any other action.
- Could explain Failure B: **No** — onClick mutates state only; nothing
  in the chain navigates anywhere, let alone to `/`.

---

## Path 2 — Send-to-Kitchen success effect re-trace

### What I found

`placeOrderMutation.onSuccess` at `pos.tsx:1283-1328`:

- For dine-in (`pos.tsx:1306-1318`), the only mutation to `tabs[]` is
  `updateActiveTab({ sentCartKeys, heldOrderId, heldOrderVersion,
  discount: "", orderNotes: "", selectedOfferId: null,
  dismissedRuleIds: [] })`. `updateTab` (`pos.tsx:410-417`) maps with
  spread `{ ...t, ...patch }`, so **`tab.id` and `selectedTable` are
  preserved**.
- For takeaway/delivery (`pos.tsx:1319-1322`), `updateActiveTab` is
  called with `selectedTable: ""`. Same spread behavior — `tab.id` is
  preserved. `setShowBillModal(true)` opens `BillPreviewModal`.
- `queryClient.invalidateQueries` (`pos.tsx:1324-1327`) refetches
  `/api/orders`, `/api/tables`, `/api/offers`, `/api/combo-offers`.
  None of these query keys feed into `tabs[]` or `activeTabId`. The
  realtime listeners (`pos.tsx:641-658`) only invalidate caches; they do
  not touch tabs or location.

There is **no `useEffect` with `tabs` or `activeTabId` in its dep array
that fires a setter on `tabs[]` or navigates**. The only `tabs`-watching
effects are storage hydration (`pos.tsx:605-623`) and a memo for
`activeTab` (`pos.tsx:401`); neither sets `activeTabId` after order
placement.

### `BillPreviewModal` lifecycle

`client/src/components/pos/BillPreviewModal.tsx`:

- A grep for `navigate|useLocation|useNavigate|setLocation|wouter` in
  this file returns **no matches**. The modal does not navigate.
- A grep for `setActiveTabId|activeTabId|history\.|tabs` returns one
  match at `BillPreviewModal.tsx:729` which is only
  `${window.location.origin}/receipt/${createdBill.id}` — a string
  build, not a navigation. The modal cannot switch tabs or change route.

### `[B]` keyboard shortcut

Two listeners:

```
1508:        else if (e.key === "b" || e.key === "B") {
1509:          e.preventDefault();
1510:          const billOrderId = activeTab?.heldOrderId || lastPlacedOrder?.orderId;
1511:          if (billOrderId) navigate(`/pos/bill/${billOrderId}`);
1512:        }            // ctrl+b / cmd+b path
...
1534:        if (e.key === "b" && cart.length > 0) {
1535:          e.preventDefault();
1536:          const billOrderId = activeTab?.heldOrderId || lastPlacedOrder?.orderId;
1537:          if (billOrderId) {
1538:            navigate(`/pos/bill/${billOrderId}`);
1539:          } else {
1540:            setShowBillModal(true);
1541:          }
1542:        }            // bare 'b' path
```

Both targets are `/pos/bill/:orderId` — **not `/`**. Neither sets
`activeTabId`. The `inInput` guard at `pos.tsx:1492-1505` blocks the
shortcut while focus is in an input. A keystroke during Send-to-Kitchen
cannot reroute to the dashboard.

### Confidence: HIGH

Direct read of every line in the success path; greps confirm
`BillPreviewModal` has no router or tab-state coupling.

### Verdict
- Could explain Failure A: **No** — no setter on `activeTabId` and no
  removal/reorder of `tabs[]` in the success path.
- Could explain Failure B: **No** — no navigation to `/` from any
  branch reached during Send-to-Kitchen.

---

## Path 3 — Tab-close and tab-replacement edge cases

### What I found

All `setTabs` call sites:

```
411:    setTabs(prev => { … });          // updateTab — preserves tab.id
425:    setTabs(prev => { … });          // setCart — preserves tab.id
439:    setTabs(prev => { … });          // addTab — appends only
449:    setTabs(prev => { … });          // closeTab — filters out one tab
616:            setTabs(saved as OrderTab[]);  // posCartKey hydration
1101:    setTabs(prev => { … });          // recallHeldTab — appends
1152:    setTabs(prev => { … });          // recallServerOrder — appends
1452:      setTabs(prev => { … });        // splitOrderMutation.onSuccess — replaces
```

All `setActiveTabId` call sites:

```
445:    setActiveTabId(tab.id);          // addTab
454:        setActiveTabId(fresh[0].id); // closeTab last-tab fallback
463:        setActiveTabId(updated[…]);  // closeTab adjacent-tab fallback
617:            setActiveTabId(...);     // posCartKey hydration effect
1106:    setActiveTabId(tab.id);          // recallHeldTab
1153:    setActiveTabId(tab.id);          // recallServerOrder
1458:      if (splitTabs.length > 0) setActiveTabId(splitTabs[0].id);
1913:                onClick={() => setActiveTabId(tab.id)}
```

**None of these fire from the Send-to-Kitchen success path.** The only
mutators reachable from `placeOrderMutation.onSuccess` are
`updateActiveTab` (preserves id) and the two `queryClient.invalidate`
calls (orthogonal to tab state).

### `updateActiveTab` preserves `tab.id` even with cleared fields

`pos.tsx:410-422`:

```
410:  const updateTab = useCallback((id: string, patch: Partial<OrderTab>) => {
411:    setTabs(prev => {
412:      const updated = prev.map(t => t.id === id ? { ...t, ...patch } : t);
```

The takeaway success branch (`pos.tsx:1321`) clears `selectedTable: ""`,
`cart: []`, `sentCartKeys: []`, `heldOrderId: undefined`. The spread
preserves `tab.id`. There is no filter step.

### Empty `selectedTable` does not invalidate a tab

A grep for `selectedTable` checks (`pos.tsx:1215`, `1303`, `1361`) shows
empty `selectedTable` is treated as a validation gate ("select a table"
toast at `pos.tsx:1361`), not a reason to remove the tab. `tabLabel`
(`pos.tsx:1482-1487`) returns `"Dine-in"` for an unmatched table, but
the tab still renders with its `tab.id`.

### Confidence: HIGH

Exhaustive enumeration of `setTabs` and `setActiveTabId` call sites.

### Verdict
- Could explain Failure A: **No** — the Send-to-Kitchen success path
  cannot remove or reorder tabs.
- Could explain Failure B: **No** — Path 3 doesn't navigate.

---

## Synthesis

> **Failure A IS NOT explainable from the code paths I traced.**
> Reason: `placeOrderMutation.onSuccess` for dine-in only calls
> `updateActiveTab` (which preserves `tab.id`). No `setActiveTabId` is
> reachable from this path. No `useEffect` on `activeTabId` or `tabs[]`
> reassigns the active tab as a side effect of the query
> invalidations fired in onSuccess. The `activeTab` memo's fallback to
> `tabs[0]` (`pos.tsx:401`) is the only way the *displayed* active tab
> can shift without a `setActiveTabId` call — and that requires the
> active tab to be removed from `tabs[]`, which doesn't happen on Send
> to Kitchen for dine-in.

> **Failure B IS NOT explainable from the code paths I traced.**
> Reason: The tab-bar onClick at `pos.tsx:1913` is `setActiveTabId(tab.id)`
> with no navigate, no router side effect, and no `useEffect` chain that
> ends in a route change. Every `navigate(...)` call in `pos.tsx` and
> `BillPreviewModal.tsx` targets `/pos/bill/:id`, `/tickets`, or
> `/tables` — never `/`. The route guard at `App.tsx:214-256` does not
> redirect to `/`; it renders `<AccessDenied />` with a `history.back()`
> button. The `Redirect to="/"` in `App.tsx:635` is for `/dashboard`,
> not `/pos`.

### Most likely explanations

1. **Verifier misinterpretation.** The reverted F-233 fix moved the
   green Bill button from the `lastPlacedOrder` notification banner
   (`pos.tsx:1992` in current code) to the cart action row next to
   Hold/Split. After Send to Kitchen on T7, that button became visible
   in the cart sidebar and would `navigate('/pos/bill/:id')` on click.
   A verifier scanning the screen for the just-placed order could have
   (a) mistaken a re-render flicker for a tab switch, or (b) clicked
   the new green Bill button and read the resulting URL change as a
   tab-induced navigation.
2. **Out-of-scope code paths.** Possible runtime triggers I did not
   trace:
   - Idle-logout dialog firing mid-test (`App.tsx:258-323`) — would log
     out and bounce through `/login` → `/`, but is gated by
     `timeoutMinutes > 0` and a 60-second warning.
   - A realtime websocket event causing `activeSessionData` to refetch
     and `posSessionId` to flip, which changes `posCartKey` and
     triggers the hydration effect at `pos.tsx:605-623` — but this only
     replaces tabs from IDB if all current tabs have empty carts
     (`hasContent` check at `pos.tsx:614`). For T7 with items, this
     branch does not execute.
   - Browser back-forward cache or PWA service worker behavior.
   - A second tab/window of the app pushing storage events.

If MAY-BE conditions exist, they would be: posSessionId flipping
mid-test plus a stale IDB snapshot whose tabs[0] is T88888 — combined
with all current tabs being treated as "empty" by `hasContent`. This is
implausible for an in-flight T7 order with items.

---

## Incidental findings

- `pos.tsx:401` `activeTab` fallback (`tabs.find(...) || tabs[0]`)
  silently masks a stale `activeTabId`. If `activeTabId` ever points to
  a tab no longer in `tabs[]`, the cart, order details, and totals
  render against `tabs[0]` while the highlighted tab in the bar is
  *none* (because `tab.id === activeTabId` is false for every rendered
  tab). This is a brittle UX pattern — a verifier could perceive this
  as "the active tab switched without a click" if they only look at
  which tab is highlighted vs. which tab's content is rendered.
- `pos.tsx:605-623` hydration effect trusts IDB over local state when
  the local tabs have no cart content. There is no version/timestamp
  reconciliation between IDB and React state — if `setMenuCache`,
  `saveActiveCart`, or any other write races with a `setTabs` for a
  fresh tab, the hydration could clobber a fresh tab. Low risk in
  practice but worth a note.
- `pos.tsx:1556` keyboard handler dep array includes `activeTab` and
  `cart.length` — every cart change re-binds the handler. Not a bug,
  but unnecessary churn.
- The L1992 Bill button has `onClick={() => { if (lastPlacedOrder?.tableId)
  { navigate(...) } else { setShowBillModal(true) } }}`. For dine-in
  orders the navigate fires; for takeaway it opens the modal. This
  asymmetry means Send-to-Kitchen for dine-in produces a banner whose
  primary green action *leaves the POS page entirely*, which is
  consistent with the user-facing complaint behind F-233 itself.

---

## Open questions

1. Were Failure A / Failure B reproduced against the post-revert code,
   or only against the F-233 fix (commit 434240a)?
2. Did the verifier capture a console log, network HAR, or screenshot
   of the URL bar at the moment of Failure B?
3. Was the failing session running with multiple browser tabs/windows
   open against `/pos`?
4. Was there an idle-logout warning shown during the test window?

## Verdict for fix-vs-defer decision

Hold. The reported behaviors are **not** in the code paths covered by
the F-233 fix or the surrounding tab/order machinery. Before any code
change, the parallel reproduction tests on production should answer
open questions 1–4. If they cannot reproduce, the report is most
plausibly a verifier misread of the new Bill button's navigation
behavior.

---

## Diff verification

Gap-closer pass on the reverted F-233 fix (commit `434240a`,
`client/src/pages/modules/pos.tsx` only, +6 / -4) to confirm the
three-path investigation did not miss any code that the diff itself
introduced.

Source of truth: `git show 434240a -- client/src/pages/modules/pos.tsx`.

### Hunk 1 — `@@ -1989,10 +1989,6 @@` (removal)

Four lines removed from the `lastPlacedOrder` banner — the transient
green "Bill" button and its `[B]` kbd label:

```
-              <Button size="sm" className="h-6 text-xs px-2 bg-green-600 hover:bg-green-700 text-white gap-1" onClick={() => { if (lastPlacedOrder?.tableId) { navigate(`/pos/bill/${lastPlacedOrder.orderId}`); } else { setShowBillModal(true); } }} data-testid="button-open-bill">
-                Bill
-                <kbd className="text-[9px] opacity-75 bg-green-700 px-1 rounded">[B]</kbd>
-              </Button>
```

The removed onClick handler is exactly:

```
onClick={() => { if (lastPlacedOrder?.tableId) { navigate(`/pos/bill/${lastPlacedOrder.orderId}`); } else { setShowBillModal(true); } }}
```

**MATCHES the documented removed handler.**

### Hunk 2 — `@@ -2309,6 +2305,12 @@` (addition)

Six lines added to the cart-action row, between Hold and Split — a
persistent green Bill button gated on `activeTab?.heldOrderId`:

```
+            {activeTab?.heldOrderId && (
+              <Button data-testid="button-open-bill" size="sm" className="text-xs px-2.5 gap-1 bg-green-600 hover:bg-green-700 text-white" onClick={() => { const orderId = activeTab?.heldOrderId; if (!orderId) return; navigate(`/pos/bill/${orderId}`); }} title={tp("openBill")}>
+                <Receipt className="h-3.5 w-3.5 mr-1" /> {tp("openBill")}
+                <kbd className="text-[9px] opacity-75 bg-green-700 px-1 rounded ml-0.5">[B]</kbd>
+              </Button>
+            )}
```

The added onClick handler is exactly:

```
onClick={() => { const orderId = activeTab?.heldOrderId; if (!orderId) return; navigate(`/pos/bill/${orderId}`); }}
```

**MATCHES the documented added handler.**

### Forbidden-construct check

For each construct that could explain Failure A or B, scanned the full
diff text:

| Construct                                        | Present in diff? |
|--------------------------------------------------|------------------|
| `setActiveTabId`                                 | **No**           |
| `navigate('/')` or `navigate("/")`               | **No**           |
| `setTabs`                                        | **No**           |
| `useEffect` watching `tabs[]` or `activeTabId`   | **No**           |
| onClick doing anything other than `navigate('/pos/bill/:id')` | **No** (the removed handler had a `setShowBillModal(true)` fallback for the no-tableId branch, which only opens a local modal — does not navigate anywhere) |

Both hunks are JSX-only changes confined to two button elements. No
hooks added, no effects added, no state setters introduced. The diff
cannot reach `activeTabId`, `tabs[]`, or any route other than
`/pos/bill/:id`.

### Confirmed clean: **YES**

### Confidence: **HIGH**

The diff is 10 lines total across two hunks. Every line was inspected.
Both onClick handlers match the documented expectations character for
character. Nothing in the F-233 fix could produce Failure A
(automatic tab switch) or Failure B (navigate to `/`). The
three-path conclusion stands.

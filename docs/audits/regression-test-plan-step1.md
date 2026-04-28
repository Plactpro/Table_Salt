# Regression Test Plan — Fixed Bugs (Step 1: planning only)

**Branch:** `regression-tests-fixed-bugs`
**Date:** 2026-04-28
**Status:** PLAN ONLY. No tests written. Blocked on local environment (see Blockers below).

## Source documents

- `docs/audits/bug-inventory.md` — single source of truth for bug state. The "FIXED — Resolved April 16–17" table lists the 17 bugs F1–F17 covered by this plan.
- `local-scratch/table_salt_pos_audit.md` — full POS audit that originally found Bugs #1–#13. Several map directly to F1–F8.

## Commit-to-bug mapping (verified against local `main` history)

The bug inventory cites SHAs `a024e11`, `356c0e2`, `3d2a86f`, `317579c`, `6aaf0c8`, `8b3051c` — these do NOT exist in our local `main`. They appear to be PR-merge SHAs from the upstream Plactpro fork. The actual fix commits in our `main` are:

| Inventory ID | Inventory SHA | Local SHA | Local commit subject |
|---|---|---|---|
| F1, F2, F3, F4, F5, F6, F7, F8 | `a024e11` | `769de46` | "fix: resolve 6 critical POS bugs (KOT, table transfer, receipt crash, recall, split, covers)" |
| F9 | `356c0e2` | `e79def9` | "fix: add tenantId to createOrderItem calls so getOrderItemsByOrder finds them for KOT creation" |
| F10 | `3d2a86f` | `0b913a1` | "fix: resolve POS crash when voiding sent cart item — fetch server item id before opening void modal" |
| F11, F12, F13 | `317579c` | `f0a5aac` | "fix: void request persistence, auto-create bill on takeaway settlement, order number generation" |
| F14 | `6aaf0c8` | (multiple) | Distributed across migration commits (`48b964d`, `c636a54`, `65b2858`, `bb7b705`, `39b7b39`, `895f25d`, etc.) |
| F15 | (no commit) | (no commit) | One-off DB UPDATE on 2026-04-09 |
| F16, F17 | `8b3051c` | `fe4f91d` / `440e984` / `1e14592` / `44f7b1e` / `ccd80d7` | "null guards for cash page" / "null guards for kitchen-board ticket items" |

The discrepancy itself is worth tracking — if we ever bisect against bug-inventory.md SHAs we will fail. Suggest a follow-up to either rewrite the inventory with our local SHAs or note the upstream-fork origin in the file's preamble.

## Two bugs that are NOT regression-testable as Playwright e2e

### F-14 — 49 missing DB columns (skipped)

The fix was a sequence of `ALTER TABLE … ADD COLUMN` migrations. The original failure mode was scattered server 500s on whatever endpoint happened to reference a missing column. A regression test would need to either:

- Run against a deliberately rolled-back schema (we cannot mutate production-shaped Postgres locally without a full env), or
- Assert the existence of every one of the 49 columns by introspecting `information_schema.columns` (this tests the schema, not the application — and once the migration is applied, the test passes forever even if a future migration drops a column for a different reason).

Neither is a useful regression test for the *original* bug (a runtime 500). The right place to catch this class of bug is migration CI plus type-check (`npm run check`); we should NOT add a "schema audit" Playwright test that pretends to be a regression test for F-14.

**Decision: skip. Note in this plan, no test file.**

### F-15 — Outlets stored INR/India/GST 18% instead of AED/UAE/VAT (skipped)

The fix was a one-time `UPDATE outlets SET currency = 'AED', country = 'UAE', tax_type = 'VAT', tax_rate = 5 WHERE …` on production. There is no commit to bisect, no original-bad code to regress against. A test asserting "current outlet currency is AED" tells us nothing about whether the bug has reappeared — it would only catch the case where a future, unrelated bug reset outlet config to defaults.

The actual guard against this regression is: outlet creation/update routes must validate currency is per-tenant-configurable and not default to a hard-coded country. That's a code review concern and a server-side validation test, not a regression test for this specific data fix.

**Decision: skip. Note in this plan, no test file.**

## Plan for the 15 testable bugs

All tests will:

- Use the existing `storageState: '.auth/<role>.json'` pattern.
- Use `page.request` (Playwright's `APIRequestContext`) for API-level assertions — it inherits the storageState session cookie, gets CSRF for free, and lets us assert on status codes, headers, and JSON body shapes without driving a browser through 6 clicks.
- Live in test files grouped by *commit* (not by bug ID), so a future bisect against a single regressed commit lands in one file.
- Assume a baseline of: at least one tenant, one outlet, one menu item, two free tables, the seeded `owner` / `manager` / `kitchen` users from `tests/e2e/helpers/test-data.ts`. The test should *fetch* IDs from the API at setup time, never hardcode them.

### File layout

| File | Bugs covered | Auth role |
|------|--------------|-----------|
| `tests/e2e/regression-769de46-pos-critical.spec.ts` | F1, F2, F3, F4, F5, F6, F7, F8 | `owner` (and `manager` for F8) |
| `tests/e2e/regression-e79def9-orderitem-tenantid.spec.ts` | F9 | `owner` |
| `tests/e2e/regression-0b913a1-void-modal.spec.ts` | F10 | `manager` |
| `tests/e2e/regression-f0a5aac-billing-numbering.spec.ts` | F11, F12, F13 | `owner` (and `kitchen` for F13) |
| `tests/e2e/regression-null-guards.spec.ts` | F16, F17 | `owner` |

### Per-bug detail

#### F1 — Takeaway/Delivery KOT never generated (server)

- **Original bug** (audit doc Bug #2): `POST /api/orders` only created KOT print jobs when `status` was `in_progress` or `sent_to_kitchen`. Takeaway/delivery orders have `status: "new"`, so kitchen never got a ticket. Fix added `order.status === "new" && order.channel === "pos"` to the KOT condition.
- **Assertion approach:** API-level. Place a takeaway order via `POST /api/orders` with `orderType: "takeaway"`, `paymentMethod: "cash"`, `status: "new"`, `channel: "pos"`, valid items, customer name+phone. Then `GET /api/print-jobs?referenceId=<orderId>&type=kot` and assert at least one job exists with `status: "queued"` (or `"printed"` if auto-print fired). Also `GET /api/print-jobs/<jobId>` and assert `payload.items` is non-empty and matches the order's items.
- **Setup data:** one menu item ID fetched via `GET /api/menu-items?limit=1`. Customer name + phone literals (`"Regression Test"` / `"+971500000000"`).
- **Risk:** auto-print may run via `setImmediate` and flip the job to "printed" before our query lands; assert on `status in ['queued', 'printed']` rather than strictly `'queued'`.

#### F2 — Takeaway/Delivery KOT never dispatched (client)

- **Original bug**: `pos.tsx` `placeOrderMutation.onSuccess` had `if (isDineIn && data?.id) dispatchKotForOrder(...)` — gating dispatch on `isDineIn` meant takeaway/delivery never dispatched. Fix changed gate to `if (data?.id && !data?.queued)`.
- **Assertion approach:** This is a *client-only* code change. The server-side outcome (KOT job exists in DB) is already covered by F1's test, so a duplicate API-level assertion adds no signal. The unique behavior — `dispatchKotForOrder` actually firing — would need either (a) intercepting `window.print` in Playwright or (b) intercepting the `GET /api/print-jobs?referenceId=…&status=queued` call that `dispatchKotForOrder` makes immediately after order placement.
- **Plan:** stub out the `print-jobs` GET via `page.route()`, drive the Place Order flow in the UI (takeaway, cash, "Confirm payment"), and assert that the stub was called with `referenceId=<orderId>&status=queued` within 2 seconds of order success. If the gate regresses, the stub is never called.
- **Setup data:** same menu item lookup as F1, plus a logged-in browser session (not just `page.request`).
- **Risk:** medium — `dispatchKotForOrder` in `pos.tsx` is async fire-and-forget, so timing assertion needs a generous `expect.poll`.

#### F3 — `/api/orders/:id/transfer-table` uses invalid status `"available"`

- **Original bug** (audit doc Bug #12): the `/transfer-table` endpoint marked the *old* table as `status: "available"` — but the `tableStatusEnum` allows only `free | occupied | reserved | cleaning | blocked`. Postgres rejected the UPDATE, leaving the old table stuck at `"occupied"`. Fix changed `"available"` to `"free"`.
- **Assertion approach:** API-level. Setup: pick two free tables (T_A, T_B). `POST /api/orders` with `tableId: T_A.id` (creates order, marks T_A occupied). `POST /api/orders/:id/transfer-table` with `{ tableId: T_B.id, version: 1 }`. Then `GET /api/tables/:T_A.id` and `:T_B.id`. Assert `T_A.status === "free"`, `T_B.status === "occupied"`. Pre-fix this would have been `T_A.status === "occupied"`.
- **Setup data:** two free tables — fetched dynamically via `GET /api/tables?status=free&limit=2`. If fewer than 2 free tables exist, test should be skipped with `test.skip()` and a clear message rather than fail flakily.
- **Risk:** low.

#### F4 — Public receipt endpoint crashes on `user.tenantId`

- **Original bug** (audit doc Bug #11): `GET /api/public/receipt/:id` is unauthenticated, but the handler referenced `user.tenantId` which is always `undefined` on a public route → `ReferenceError` → 500. Fix changed the source to `bill.tenantId` (looked up from the bill record itself).
- **Assertion approach:** API-level. Setup: place a takeaway order + create a bill (or use any bill ID). Use `page.request.newContext()` (no storage state — explicit unauthenticated request) to `GET /api/public/receipt/:billId`. Assert status 200 and JSON body has `billNumber`, `totalAmount`, `currency`, `items`. Specifically assert no `tenantId` field (per the `O8` design: public endpoints expose only safe fields).
- **Setup data:** a bill ID. Easiest source: place a takeaway order with `paymentMethod: "cash"`, response includes `bill.id` (per F12 auto-bill creation). If F12 is broken, fall back to creating a bill explicitly via `POST /api/restaurant-bills`.
- **Risk:** low. The unauth context is a tested Playwright pattern.

#### F5 — Recalled server orders have empty `sentCartKeys`

- **Original bug** (audit doc Bug #4): `recallServerOrder()` in `pos.tsx` set `sentCartKeys: []` on the reconstructed tab. If the recalled order was already sent to kitchen, the staff saw all items as "unsent" and pressing "Send Addon KOT" re-sent everything. Fix populates `sentCartKeys` to `reconstructedCart.map(c => c.cartKey)` (all reconstructed items treated as already-sent).
- **Assertion approach:** UI-level. Setup: place a dine-in order via API (status `in_progress`, with items). Then PATCH it to `on_hold` so it appears in the held-orders list. Open the POS in a browser, click "Recall", select the held order. Assert that the recalled tab's cart items all show the "Sent" badge / `data-sent="true"` attribute (or whatever the rendered marker is — needs DOM verification on the current build). The negative assertion: the "Send to Kitchen" button is in addon-KOT mode (text reads "Send Addon KOT"), not first-time-send mode.
- **Setup data:** one held order owned by the logged-in user (fetched / created at test start).
- **Risk:** medium — recall UI flow has real DOM complexity. The button text and "Sent" badge are i18n strings (`pos.recalled` namespace), so use `data-testid` attributes if present, otherwise fall back to translated text.

#### F6 — Split of partially-sent order resends all items to kitchen

- **Original bug** (audit doc Bug #5): `splitOrderMutation` built each split tab with `sentCartKeys: []`, causing every split group to be POSTed as a fresh `in_progress` order — kitchen got duplicate KOTs for already-prepared items. Fix tracks `originalSentKeys` and preserves sent status per group.
- **Assertion approach:** API-level + DB-state-level. Setup: place a dine-in order with 4 items. Call `POST /api/orders/:id/split` (or whatever the split endpoint is — needs verification by reading the current `pos.tsx` `splitOrderMutation` code) with two groups. Assert: original order is gone or marked `split`, two new orders exist with the correct line items, and **no new KOT print jobs were created beyond the original**. Specifically: count `GET /api/print-jobs?referenceId=<originalId>&type=kot` before split → N. After split, count of KOT jobs across original + both new orders → still N (because items were already sent). If the bug regresses, the count grows.
- **Setup data:** one in-progress order with ≥2 items, all `isAddon: false`.
- **Risk:** medium-high. Behavior of split with already-sent items is the most subtle of the F-bugs and the API endpoint shape needs verification before writing the test.

#### F7 — Covers (pax) stored only in `notes` string, not `orders.covers` column

- **Original bug** (audit doc Bug #8): `buildOrderData()` embedded covers as `"Covers: X"` in the `notes` field but never set the dedicated `covers` column on the order. Reporting that aggregated covers count would silently see all NULLs. Fix: `buildOrderData` now sets `orderData.covers = tab.covers ?? 1`.
- **Assertion approach:** API-level. `POST /api/orders` with `covers: 4`, then `GET /api/orders/:id` and assert `response.covers === 4`. Pre-fix this would have been `null` or `1`.
- **Setup data:** menu item ID, free table.
- **Risk:** low.

#### F8 — Wrong-table change does not update table statuses

- **Original bug** (audit doc Bug #1, PR-009): the wrong-table flow PATCHed `/api/orders/:id` with `{ tableId: newId, version }` — but the `PATCH /api/orders/:id` handler only frees tables on status transitions (paid/voided/cancelled), not on `tableId` change. Result: old table stuck `occupied`, new table stuck `free`. Fix: client now uses `/api/orders/:id/transfer-table` for table changes.
- **Assertion approach:** Hybrid. The *client-side* fix is "use transfer-table endpoint instead of plain PATCH" — already partially asserted by F3 (which tests the `/transfer-table` endpoint produces correct table states). The *unique* assertion for F8 is that the client *uses* that endpoint. Drive the wrong-table UI flow in Playwright (place dine-in order at T_A, switch to T_B, confirm dialog), and use `page.waitForRequest(req => req.url().includes('/transfer-table') && req.method() === 'POST')` to assert the transfer-table request was issued. Negative assertion: no `PATCH /api/orders/:id` request was issued in the same window with `{ tableId: ... }` body.
- **Setup data:** two free tables, menu item.
- **Risk:** medium. The "wrong table" confirmation dialog text is i18n, needs `data-testid` resolution.

#### F9 — KOT creation: `createOrderItem` calls missing `tenantId`

- **Original bug**: storage `createOrderItem(data)` insert was called without `tenantId` in `data`. Subsequent `getOrderItemsByOrder(orderId, tenantId)` fetches couldn't find the items because they had `tenantId = NULL`. Cascading effect: the KOT print job was created with empty `items` array. Fix added `tenantId: user.tenantId` to both call sites in `orders.ts`.
- **Assertion approach:** API-level. `POST /api/orders` with 2 items. Then `GET /api/orders/:id` (which calls `getOrderItemsByOrder` server-side) and assert `response.items.length === 2`. Also `GET /api/print-jobs?referenceId=<id>&type=kot` and assert the latest job's `payload.items.length === 2`. If F9 regresses, items would be empty in the print job (and possibly in the order detail GET).
- **Setup data:** two distinct menu item IDs.
- **Risk:** low.

#### F10 — Void modal crash uses `CartItem` instead of server item ID

- **Original bug**: When voiding a sent cart item, the void modal received a client-side `CartItem` (with no real `id`, just a `cartKey`). The void API call then crashed because it expected a real `order_items.id`. Fix: void flow now first fetches the matching server `order_items.id` via `GET /api/orders/:id` then opens the modal with that ID.
- **Assertion approach:** UI-level. Place a dine-in order via API. Open POS, navigate to the active order, click the void button on a sent line item. Assert the void modal opens *without* a runtime error toast and that the modal's confirm button issues `POST /api/orders/:orderId/items/:itemId/void` (or whatever the void endpoint is — needs verification) with a non-empty `itemId` that matches a server-side `order_items.id`.
- **Setup data:** dine-in order with at least one sent item.
- **Risk:** medium. Void UI flow + role gates (kitchen role allowed per F13).

#### F11 — `order_number` always NULL

- **Original bug**: the schema has `orders.order_number` but `POST /api/orders` never populated it. Fix added an atomic `UPDATE orders SET order_number = '<PREFIX>-YYYYMMDD-NNN' WHERE id = $1` after `createOrder`, with prefix from tenant config.
- **Assertion approach:** API-level. `POST /api/orders` and assert `response.orderNumber` matches `/^[A-Z]+-\d{8}-\d{3}$/`. Pre-fix this would have been `null`.
- **Setup data:** menu item.
- **Risk:** low. Note: regex should accept `INV-YYYYMMDD-NNN` (default prefix) and any tenant-configured prefix.

#### F12 — Bills not auto-created for takeaway orders

- **Original bug**: takeaway/delivery orders require a bill at order time (cash collected at counter). Pre-fix, no bill was auto-created — staff had to manually trigger it. Fix added a block in `POST /api/orders` that creates a bill with `paymentStatus: "pending"` when `paymentMethod` is in the order body and `status === "new"`.
- **Assertion approach:** API-level. `POST /api/orders` with `orderType: "takeaway"`, `paymentMethod: "cash"`, `status: "new"`. Assert `response.bill` is non-null, `response.bill.orderId === response.id`, `response.bill.paymentStatus === "pending"`. Negative case: `POST /api/orders` for a dine-in order without `paymentMethod` → `response.bill === null` (no auto-bill for dine-in).
- **Setup data:** menu item.
- **Risk:** low. (Note: BL-2 is a *separate* follow-up — the auto-bill stays "pending" instead of flipping to "paid" for cash; that's the BL-2 fix recon, not in scope here.)

#### F13 — Void request: kitchen role missing from `VOID_REQUEST_ROLES`

- **Original bug**: the void-request endpoint had a role allowlist `VOID_REQUEST_ROLES` that excluded `kitchen`. Kitchen staff couldn't request a void from the KDS. Fix added `kitchen` to the array.
- **Assertion approach:** API-level. Log in as `kitchen` (use `tests/e2e/.auth/kitchen.json` storageState). Place a dine-in order as `owner` first (helper). Then as kitchen, `POST /api/tickets/<orderId>/void-request` with `{ reason: "regression-test", itemIds: [<itemId>] }` (or whatever the actual body shape is — needs verification by reading `server/routers/ticket-history.ts` or wherever void-request lives). Assert status 200, not 403.
- **Setup data:** order created by another role (so kitchen needs the role permission, not ownership). Order ID + at least one item ID.
- **Risk:** low.

#### F16 — `/cash` page crash (React error boundary)

- **Original bug**: `/cash` page crashed on initial render because it accessed properties on potentially-null API response data without null-guards. Fix added null guards across all data accessors and modal props.
- **Assertion approach:** UI smoke test, but DEEP smoke. Navigate to `/cash`, wait for `domcontentloaded` and a brief settle. Assert: (a) the URL stayed at `/cash` (no redirect to `/error`), (b) no element with `[data-testid="error-boundary"]` or text matching `/something went wrong/i` is visible, (c) at least one expected page element is rendered (heading containing "Cash" or similar). Optionally: assert no `console.error` events fired during page load.
- **Setup data:** none — page should render even with empty cash sessions.
- **Risk:** low.

#### F17 — `/kitchen-board` crash (corrupted file)

- **Original bug**: `/kitchen-board` had a file corruption from an earlier commit (`28a2ba2`) that crashed the page. Fix restored the file and added null guards for ticket item data.
- **Assertion approach:** Same pattern as F16. Navigate to `/kitchen-board`, assert no error boundary, assert at least one expected element is rendered.
- **Setup data:** none.
- **Risk:** low.

## Blockers (must resolve before tests can be written / run)

### Blocker 1 — No `.env`, no local Postgres

- `D:\audits\Table_Salt\.env` does not exist. Only `.env.example` (template) and `.env.migration` (95 bytes — almost certainly just a `DATABASE_URL` for `drizzle-kit push`).
- `npm run dev` (`tsx server/index.ts`) reads `DATABASE_URL`, `SESSION_SECRET`, and likely many third-party keys (Stripe, Razorpay, S3, SMTP) from `process.env` at boot. Without `.env` or shell exports, the server will not start.
- Port 5000 is not listening (verified via `netstat`).
- Per CLAUDE.md hard rule 1, Claude Code may not connect to production Postgres or make HTTP requests to inifinit.com. So even if a `DATABASE_URL` for prod exists somewhere, it is not usable here.
- **Resolution path:** owner provides a working local Postgres + complete `.env`, OR sets up local development on a future evening. Tracked outside this branch.

### Blocker 2 — Stale `.auth/*.json` fixtures + `globalSetup` not wired

- `.auth/owner.json`, `.auth/manager.json`, `.auth/kitchen.json` exist but are 13 days old (mtime 2026-04-15). Existing tests use `test.use({ storageState: '.auth/<role>.json' })`.
- A `tests/e2e/global-setup.ts` file exists that *would* regenerate these fixtures (logs in as each role, calls `page.context().storageState({ path })`), but `playwright.config.ts:19` has `globalSetup: undefined` — the setup is never invoked.
- Once Blocker 1 is resolved, regenerating the fixtures requires either (a) wiring up `globalSetup: './tests/e2e/global-setup.ts'` in `playwright.config.ts`, or (b) running `tsx tests/e2e/global-setup.ts` manually before the first test run.
- **Out of scope for this branch** per the task instructions ("Do NOT modify playwright.config.ts to wire up globalSetup"). Recorded here as follow-up work: file a small chore to wire globalSetup, run once-per-day fixture refresh on CI.

### Blocker 3 — Existing tests are shallow page-load smoke tests

- The 8 existing specs (`auth`, `billing`, `kitchen`, `menu`, `order-management`, `pos-checkout`, `staff`, `support`) are page-load smoke tests: navigate to `/route`, `expect(page).toHaveURL`, count interactive elements, check that `body.textContent.length > 200`. They never assert on API responses, status codes, idempotency, or version semantics.
- The 15 testable F-bugs in this plan are mostly API/state bugs that page-load smoke tests cannot catch. Per task instructions, the regression tests will be deeper (API-level via `page.request`) — they will *complement* the existing smoke tests, not replace or restyle them.
- **Implication for review:** when these new tests land, reviewers should not flag them as "different style from rest of suite" — that asymmetry is intentional and called out here.

## Summary of work remaining (after Blocker 1 resolves)

1. **Resolve Blocker 2:** wire `globalSetup` in `playwright.config.ts` OR document a one-liner the developer runs before `npx playwright test` (separate branch).
2. **Verify endpoint shapes** for: `POST /api/orders/:id/transfer-table` body, void-request endpoint path + body, split endpoint path + body, void-item endpoint path. Currently inferred from audit doc + recon; one read of the current router code per endpoint before writing the test.
3. **Write 5 spec files** per the table in "File layout" above.
4. **Run** `npx playwright test tests/e2e/regression-*` and verify all 15 pass (because the bugs are fixed). Any failure means either the test is wrong or a fix has regressed — stop and triage per the original task instructions.
5. **Skip** F-14 and F-15 with the rationales above documented in the spec preamble.

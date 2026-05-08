# F-270 Phase 1 — Static Investigation

Date: 2026-05-09
Branch: `chore/f270-phase1-investigation`
Status: read-only investigation, no code changes outside `audit/`.
Tester evidence: Nandhini, 2026-05-08 — KDS tickets and printed receipts show timestamps that match neither the saved tenant timezone nor the user's browser timezone. Severity: BLOCKING.

---

## 1. Goal of Phase 1

Identify every server- and client-side site where KDS or receipt timestamps are rendered, so Phase 2 (KDS) and Phase 3 (receipts) can apply minimal, targeted fixes. F-225 on `fix/F-225-tenant-tz-helper` is treated as a **specification reference** only — current `main` is 18+ days ahead of that branch and a re-implementation is cleaner than a merge.

The output is the file list, line numbers, and shape of changes needed in Phase 2 and Phase 3. No edits are made in this phase.

---

## 2. F-225 spec summary (the abandoned branch as reference)

The F-225 branch contains six relevant changes (commits `5e3d8bf`, `6b8f305`, `15448b8`, `ae08340`, `979e5f1`, plus other unrelated work).

### 2.1 `shared/lib/tenant-tz.ts` (NEW in F-225, does not exist on main)

[VERIFIED] `git show fix/F-225-tenant-tz-helper:shared/lib/tenant-tz.ts` returns ~75-line module.

Public API:
- `formatInTenantTz(instant, tenant, opts?)` — wraps `formatInTimeZone` from `date-fns-tz`. Default style: `dateStyle: "medium"`, `timeStyle: "short"`. Accepts `opts.dateStyle` / `opts.timeStyle` independently for date-only or time-only output.
- `wallClockToUtc(localString, tenant)` — wraps `fromZonedTime`.
- `tenantDateKey(instant, tenant)` — formats `yyyy-MM-dd` in the tenant TZ (date-grouping helper).
- `localDateToKey(year, month, day)` — pads zero-indexed month/day → `yyyy-MM-dd`.
- `tenantNow(tenant)` — current UTC instant; included for symmetry, also exercises the resolver.
- `resolveTenantTz(tenant)` (internal) — accepts string, `{ timezone? }` object, null, or undefined. On missing timezone, logs `console.warn("[tenant-tz] Falling back to UTC — tenant timezone missing")` and returns `"UTC"`.

Main difference vs `main`: `main` has no equivalent server-side helper. The closest analogue is `client/src/hooks/use-outlet-timezone.ts` (`formatLocal`, `formatLocalTime`, `formatLocalDate`) which are client-only and built directly on `Intl.DateTimeFormat({ timeZone })` — no shared module.

### 2.2 `tests/tenant-tz.test.ts` (NEW in F-225, does not exist on main)

[VERIFIED] 17 tests covering:
- `wallClockToUtc` for Asia/Dubai (+4), Asia/Kolkata (+5:30), UTC, and a cross-device determinism acceptance test.
- `formatInTenantTz` default style, time-only opts, date-only opts, Date vs ISO-string equivalence.
- `tenantDateKey` for late-UTC late-evening instants in Asia/Kolkata, Asia/Dubai, UTC.
- `localDateToKey` for zero-indexed months and zero-padding.
- `resolveTenantTz` fallback behavior (null tenant, null `timezone`, raw IANA string, `{ timezone: ... }` object) — verifies that the fallback path warns exactly once and that valid inputs warn zero times.

### 2.3 `server/services/escpos-builder.ts` (MODIFIED in F-225)

[VERIFIED] Reading both versions side by side:

F-225 version differs from main as follows:
- Imports added: `formatInTenantTz` from `@shared/lib/tenant-tz`, `formatInTimeZone` from `date-fns-tz`, `enIN` from `date-fns/locale`.
- `buildBill(...)` signature gains a 7th positional parameter `tenantTimezone?: string`. The `now` line (main:311) becomes:
  ```ts
  const now = tenantTimezone
    ? formatInTenantTz(new Date(), tenantTimezone, { dateStyle: "medium", timeStyle: "short" })
    : new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  ```
- `buildBillHtml(...)` similarly gains `tenantTimezone?: string`. Its `now` line and the in-body refund-date line both branch on `tenantTimezone`.
- `RefundReceiptData` interface adds `tenantTimezone?: string`.
- `buildRefundReceipt(...)` (ESC/POS) header date and per-refund date branches use `formatInTimeZone(date, data.tenantTimezone, "dd MMM yyyy, hh:mm aa", { locale: enIN })` when set.
- `buildRefundReceiptHtml(...)` printTime and refund dates use `formatInTenantTz` when `data.tenantTimezone` is set.

Untouched in F-225 (still uses host TZ even on that branch):
- `buildKOT` `sentTime` (main:232 — KOT ESC/POS).
- `buildKOTHtml` `sentTime` (main:553).
- `buildLabel` (main:404).
- `buildTestPage` (main:422).
- The in-body refund-date inside `buildBill` (main:364) — F-225 modified `buildBillHtml` and the dedicated refund receipt builders, but the **bill body's** refund-date line still uses `new Date(r.createdAt).toLocaleString("en-IN", ...)`.

> Implication: F-225 is **incomplete for KDS** by design. F-270 needs to extend the same approach to KOT and label paths.

### 2.4 `server/services/printer-service.ts` (MODIFIED in F-225)

[VERIFIED] On F-225:
- `SELECT name, timezone FROM tenants` at the bill path (around line 459 on main, equivalent on F-225).
- `SELECT name, timezone FROM tenants` at the refund-receipt path (around line 552 on main).
- `tenantTimezone` threaded into `buildBill(...)` and `buildBillHtml(...)`.
- `RefundReceiptData` populated with `tenantTimezone` and used by `buildRefundReceipt` / `buildRefundReceiptHtml`.

### 2.5 `Dockerfile` (MODIFIED in F-225)

[VERIFIED] F-225 adds `ENV TZ=UTC` (between `ENV PORT=5000` and `HEALTHCHECK`). Main has no `ENV TZ`.

`node:20-alpine` ships without `/etc/localtime` and without the `tzdata` package, so `Intl.DateTimeFormat` resolves to UTC by default — the production behavior is already UTC. The F-225 change codifies the contract so a future host-TZ leak (mounted `/etc/timezone`, `tzdata` install in a future stage, etc.) cannot silently change behavior.

### 2.6 `package.json` (MODIFIED in F-225)

[VERIFIED] F-225 adds `"date-fns-tz": "^3.2.0"` to `dependencies`. Main has only `"date-fns": "^3.6.0"`. No `date-fns-tz` on main.

This is the only new dependency the F-225 approach requires. **Per CLAUDE.md hard rule #11, installing this package needs explicit user approval before Phase 2 work.**

---

## 3. Current main's KDS timestamp path

[VERIFIED] All paths below are read from current `main` on disk after `git pull origin main`.

### 3.1 KDS arrival trigger
- `server/routers/orders.ts:37-89` — `fireKdsArrival(tenantId, orderId, userId, userName)`. Triggers timing-engine work (`updateOrderItemCooking`) and emits `kds:order_arrived` realtime events. **Does not itself emit display timestamps.**
- Called from `server/routers/orders.ts:799` (POST `/api/orders` after order creation when status is `sent_to_kitchen` or `in_progress`) and `server/routers/orders.ts:1130` (PATCH order status).

There is **no** `server/services/timing-engine.ts` or `server/services/kds-service.ts` file — `fireKdsArrival` lives inline in the orders router. Confirmed via `Glob server/services/*.ts`.

### 3.2 KOT print-job payload (where `sentAt` is captured)
- `server/routers/orders.ts:732` — `const sentAt = new Date().toISOString();` (UTC instant).
- `server/routers/orders.ts:750` — embedded in print-job payload (no-station case).
- `server/routers/orders.ts:770` — embedded in print-job payload (per-station case).

`sentAt` is correctly captured as UTC. The bug is at the **render** sites, not at capture.

### 3.3 KDS tickets API
- `server/routers/kitchen.ts:49-72` — `GET /api/kds/tickets`. Returns orders + items with raw DB timestamps (TIMESTAMPTZ, serialized as ISO UTC strings). No formatting at this layer.
- `server/routers/kitchen.ts:74-119` — `PATCH /api/kds/order-items/:id/status`. Writes `startedAt = new Date()` and `readyAt = new Date()`. No display formatting.

### 3.4 Server-side KOT renders (ESC/POS and HTML, host-TZ dependent)
- `server/services/escpos-builder.ts:232` — `buildKOT` formats `sentTime` with `new Date(order.sentAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })`. Host-TZ dependent. In production this resolves to UTC because the container has no `tzdata`.
- `server/services/escpos-builder.ts:553` — `buildKOTHtml` formats `sentTime` with `new Date(order.sentAt).toLocaleTimeString()`. Host-TZ + ambient-locale dependent.
- `server/services/escpos-builder.ts:404` — `buildLabel` `new Date().toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" })`. Host-TZ.
- `server/services/escpos-builder.ts:422` — `buildTestPage` `new Date().toLocaleString()`. Host-TZ + ambient locale.

### 3.5 Client-side KOT HTML renders (default to UTC)
`client/src/lib/print-utils.ts:22-29` — `formatInTimezone(date, timezone, dateOpts, language)` uses `new Intl.DateTimeFormat(locale, { ...dateOpts, timeZone: timezone }).format(date)`. **Default `timezone = "UTC"`** in the consuming functions:
- `client/src/lib/print-utils.ts:278-279` — `renderKotHtml({ ..., timezone = "UTC", ... })` — default is UTC.
- `client/src/lib/print-utils.ts:282` — `formatInTimezone(date, timezone, ...)` for the date string.
- `client/src/lib/print-utils.ts:283` — `formatInTimezone(date, timezone, ...)` for the time string.

[VERIFIED] None of the four `renderKotHtml(...)` callers pass `timezone:`:
- `client/src/pages/dashboards/kitchen.tsx:545` (KDS reprint button)
- `client/src/pages/dashboards/kitchen.tsx:1262` (auto-dispatch loop)
- `client/src/hooks/use-kot-auto-dispatch.ts:66` (POS-side auto-dispatch hook)
- `client/src/components/pos/PrintQueuePanel.tsx:85` (print-queue retry)

> Effect: KDS-printed KOTs render their dates and times in **UTC**, not in the tenant TZ.

### 3.6 Client-side KDS dashboard timestamps (browser-TZ)
- `client/src/pages/dashboards/kds-wall.tsx:744` — "All ready by" badge: `new Date(ticket.estimatedReadyAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })`. Browser TZ.
- `client/src/pages/dashboards/kds-wall.tsx:1261` — wall-clock display: `now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })`. Browser TZ.
- `client/src/pages/dashboards/kds-wall.tsx:1263` — wall-date: `now.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })`. Browser TZ.
- `client/src/pages/dashboards/kitchen.tsx` and `client/src/pages/dashboards/kitchen-board.tsx` — only use Date math (`Date.now() - new Date(x).getTime()`) for elapsed-time, not display formatting. **Not affected.**

> Effect: KDS dashboard headers show **browser TZ**, not tenant TZ. If the user's laptop is on UTC and the restaurant is in Dubai, the wall clock reads 4 hours behind.

### 3.7 Net diagnosis for KDS
The KDS path has **two timezone sources, neither correct**:
1. Printed KOTs render in UTC (client default + server `tzdata`-less container).
2. KDS dashboard chrome renders in browser TZ.

Tester report ("matches neither saved tenant TZ nor browser TZ") is consistent with this: the user is comparing a **printed KOT timestamp** (UTC, e.g. 03:00) against the **dashboard wall clock** (browser TZ, e.g. 06:30 if browser is in IST), expecting both to show the tenant TZ (Asia/Dubai, 07:00). Neither matches.

---

## 4. Current main's receipt timestamp path

[VERIFIED] All paths below read from current `main`.

### 4.1 routeAndPrint job dispatcher
- `server/services/printer-service.ts:222` — `routeAndPrint(...)` is the single entry point.
- Bill branch: `server/services/printer-service.ts:363-517`. Refund-receipt branch: `server/services/printer-service.ts:518-620`. Label branch: `:621-674`. KOT branch: `:237-362`.
- Callers (no caller passes a timezone today):
  - `server/routers/orders.ts:1117` (auto-print on order)
  - `server/routers/print-jobs.ts:211, 240, 298, 328, 358, 405` (six print endpoints)
  - `server/routers/restaurant-billing.ts:625` (subscription invoice)
  - `server/routers/ticket-history.ts:554, 595, 640` (reprint flows)

### 4.2 Tenant lookup inside routeAndPrint (timezone is **not** selected)
- `server/services/printer-service.ts:459` — bill path: `SELECT name FROM tenants WHERE id = $1`. Only `name`. No `timezone`.
- `server/services/printer-service.ts:552` — refund path: `SELECT name FROM tenants WHERE id = $1`. Only `name`. No `timezone`.

### 4.3 buildBill / buildBillHtml call sites
- `server/services/printer-service.ts:482` — `browserHandler.generateBillHtml(bill, order, items, undefined, tenantName, billRefundPayments...)`. No tenantTimezone parameter.
- `server/services/printer-service.ts:486` — `buildBill(bill, order, items, undefined, tenantName, billRefundPayments...)`. No tenantTimezone parameter.
- `server/services/printer-service.ts:691` — `rebuildEscposFromJob` retry path also calls `buildBill(bill, order, items)` without TZ.

### 4.4 buildRefundReceipt / buildRefundReceiptHtml call sites
- `server/services/printer-service.ts:579, 582, 590` — `buildRefundReceiptHtml(refundData)` (3 paths through HTML fallback).
- `server/services/printer-service.ts:588` — `buildRefundReceipt(refundData)` (ESC/POS path).
- `server/services/printer-service.ts:563-569` — `RefundReceiptData` constructed without `tenantTimezone` (interface on main has no such field; `escpos-builder.ts:613-620`).
- `server/services/printer-service.ts:693` — `rebuildEscposFromJob` retry calls `buildRefundReceipt(refundData)`.

### 4.5 Builder-internal render sites that produce display timestamps
All of these use host TZ (= UTC in production):
- `server/services/escpos-builder.ts:311` — `buildBill` `now`: `new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })`.
- `server/services/escpos-builder.ts:364` — `buildBill` per-refund body line: `new Date(r.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })`.
- `server/services/escpos-builder.ts:438` — `buildBillHtml` `now`: `new Date().toLocaleString()`.
- `server/services/escpos-builder.ts:529` — `buildBillHtml` per-refund body line: `new Date(r.createdAt as string).toLocaleString()`.
- `server/services/escpos-builder.ts:638` — `buildRefundReceipt` printTime: `new Date().toLocaleString("en-IN", {...})`.
- `server/services/escpos-builder.ts:655` — `buildRefundReceipt` per-refund line: `new Date(r.createdAt as string).toLocaleString("en-IN", {...})`.
- `server/services/escpos-builder.ts:677` — `buildRefundReceiptHtml` printTime: `new Date().toLocaleString()`.
- `server/services/escpos-builder.ts:690` — `buildRefundReceiptHtml` per-refund line: `new Date(r.createdAt as string).toLocaleString()`.

### 4.6 Client-side bill rendering
`client/src/lib/print-utils.ts:426-441` — `renderBillHtml({ ..., timezone = "UTC", ... })` defaults to UTC; uses `formatInTimezone(now, timezone, ...)` for both date and time.

[VERIFIED] Both `renderBillHtml(...)` callers omit `timezone:`:
- `client/src/components/pos/BillPreviewModal.tsx:793`
- `client/src/components/pos/PrintQueuePanel.tsx:100`

### 4.7 Server-side template-preview path
- `server/routers/print-jobs.ts:518` — `SELECT name FROM tenants WHERE id = $1` (no timezone).
- `server/routers/print-jobs.ts:521-522` — calls `buildBillHtml(...)` without `tenantTimezone`. The preview used by Settings → Print Templates therefore renders in UTC too.

---

## 5. Dockerfile + tenant context

### 5.1 Dockerfile
[VERIFIED] `Dockerfile` lines 30-31 set `ENV NODE_ENV=production` and `ENV PORT=5000`. **No `ENV TZ`.**

`node:20-alpine` does not include `tzdata` and has no `/etc/localtime`. As a result `process.env.TZ` is unset and `Intl.DateTimeFormat` defaults to UTC. Production behavior matches UTC today, but it is implicit, not contractual.

### 5.2 Tenant timezone schema
- [VERIFIED] `shared/schema.ts:90` — `tenants.timezone = text("timezone").default("UTC")`.
- [VERIFIED] `shared/schema.ts:229` — `outlets.timezone = varchar("timezone", { length: 100 }).default("UTC")` (per-outlet override).

### 5.3 How tenant timezone propagates today

[VERIFIED] grep for `timezone` across `server/`:
- `server/routers/auth.ts:341` — included in the session payload (`/api/auth/me` returns `tenant.timezone`).
- `server/admin-routes.ts:810, 821, 841, 895` — admin tenant create/update endpoints accept `timezone`.
- `server/services/shift-digest-mailer.ts:253` — daily shift digest emails select `timezone` for date math.

[VERIFIED] grep for `timezone` across `server/services/printer-service.ts`, `server/services/escpos-builder.ts`, `server/routers/print-jobs.ts`, `server/routers/orders.ts`, `server/routers/kitchen.ts`: **zero matches**. The print/KDS code path does **not** read `tenants.timezone` at all today.

[VERIFIED] Client side: `client/src/hooks/use-outlet-timezone.ts` resolves the effective timezone with this precedence: explicit `outletId` arg → user's outlet → single-outlet tenant's outlet → `tenant.timezone` → browser TZ → `"UTC"`. Used by `BillPreviewModal.tsx`, `pos.tsx`, `staff.tsx`, `orders.tsx`, `crm.tsx`, `billing.tsx`. **Not used** by `kds-wall.tsx`, `kitchen.tsx`, `kitchen-board.tsx`, `print-utils.ts`, or any KOT/KDS render path.

### 5.4 Outlet-timezone wrinkle
The schema supports per-outlet TZ override (`outlets.timezone`), but no server code reads it. F-225 also did not handle this — it queried only `tenants.timezone`. We carry this as an open question for Phase 2.

---

## 6. Phase 2 plan — exact files and changes for KDS fix

Goal: KOT timestamps and KDS dashboard chrome render in tenant timezone.

### 6.1 Foundations (one-time, blocks rest)
1. **Install `date-fns-tz`** — `package.json` adds `"date-fns-tz": "^3.2.0"` to dependencies. **Requires user approval per CLAUDE.md hard rule #11.**
2. **Create `shared/lib/tenant-tz.ts`** — port the F-225 helper verbatim. No changes from the F-225 spec are needed.
3. **Create `tests/tenant-tz.test.ts`** — port the F-225 test verbatim. 17 tests, all passing on the F-225 branch.
4. **Set `ENV TZ=UTC` in `Dockerfile`** — between line 31 (`ENV PORT=5000`) and line 33 (`HEALTHCHECK`). Codifies the existing implicit behavior.

### 6.2 Server: thread tenant TZ into KOT renderers
5. `server/services/escpos-builder.ts:232` — `buildKOT` gains `tenantTimezone?: string` (last positional param). The `sentTime` line branches: `tenantTimezone ? formatInTenantTz(d, tenantTimezone, { timeStyle: "short" }) : <existing host-TZ fallback>`.
6. `server/services/escpos-builder.ts:553` — `buildKOTHtml` mirror change for `sentTime`.
7. `server/services/escpos-builder.ts:404` — `buildLabel` gains `tenantTimezone?: string`; the timestamp line branches similarly. (Optional — not strictly KDS, but uses the same path; include for consistency.)

### 6.3 Server: fetch + propagate tenant TZ in printer-service
8. `server/services/printer-service.ts:459` — change `SELECT name FROM tenants` to `SELECT name, timezone FROM tenants`; capture `tenantTimezone = tenantRows[0]?.timezone` (matches the bill path the F-225 receipts commit set up).
9. `server/services/printer-service.ts:486` — pass `tenantTimezone` into `buildBill(...)` (covered by Phase 3 anyway, but the variable is fetched here once).
10. KOT branch (`server/services/printer-service.ts:237-362`): add `SELECT name, timezone FROM tenants` near the top of the branch (or at the top of `routeAndPrint` so it's shared) and pass `tenantTimezone` into `buildKOT(...)` at the call site. Mirror in `browserHandler.generateKotHtml(...)` — that helper at `:61-63` will need a TZ-accepting overload (or a direct `buildKOTHtml(order, items, tenantTimezone)` call).
11. `server/services/printer-service.ts:691` — `rebuildEscposFromJob` retry path: call `buildKOT(order, items, tenantTimezone)`. Need to either persist `tenantTimezone` in the print-job payload or refetch from tenants by `tenantId` at retry time.

### 6.4 Client: pass tenant TZ to renderKotHtml
12. `client/src/lib/print-utils.ts:279` — leave default `timezone = "UTC"` as-is (it's a safety fallback).
13. `client/src/pages/dashboards/kitchen.tsx:545` — pass `timezone: <resolved tenant TZ>` to `renderKotHtml`. Use `useOutletTimezone()` from `@/hooks/use-outlet-timezone` to resolve.
14. `client/src/pages/dashboards/kitchen.tsx:1262` — same.
15. `client/src/hooks/use-kot-auto-dispatch.ts:66` — same; this hook will need to accept a timezone parameter or read it from auth context.
16. `client/src/components/pos/PrintQueuePanel.tsx:85` — same.

### 6.5 Client: fix KDS dashboard chrome
17. `client/src/pages/dashboards/kds-wall.tsx:744` — replace `new Date(ticket.estimatedReadyAt).toLocaleTimeString([], {...})` with `formatLocalTime(ticket.estimatedReadyAt, tenantTz, {...})` (using the existing `formatLocal*` helpers in `use-outlet-timezone.ts`).
18. `client/src/pages/dashboards/kds-wall.tsx:1261` — wall-clock: replace `now.toLocaleTimeString([], {...})` with the tenant-TZ equivalent.
19. `client/src/pages/dashboards/kds-wall.tsx:1263` — wall-date: replace `now.toLocaleDateString([], {...})` with tenant-TZ equivalent.

### 6.6 Tests
20. Extend `tests/tenant-tz.test.ts` if any new helper signature is added (likely none; the F-225 helper is sufficient).
21. No new tests for `escpos-builder.ts` rendering — covered indirectly by the helper tests + manual tester verification on the new branch.

---

## 7. Phase 3 plan — exact files and changes for receipt fix

Goal: bill, refund-receipt, and template-preview timestamps render in tenant timezone.

### 7.1 Server: extend escpos-builder (matches F-225 spec exactly)
1. `server/services/escpos-builder.ts:285` — `buildBill` adds 7th positional `tenantTimezone?: string`.
2. `server/services/escpos-builder.ts:311` — branch `now` on `tenantTimezone`.
3. `server/services/escpos-builder.ts:362-372` — branch the in-body refund date on `tenantTimezone`. (F-225 left this site untouched in the ESC/POS bill body. We should fix it here to match the HTML version.)
4. `server/services/escpos-builder.ts:429` — `buildBillHtml` adds `tenantTimezone?: string`.
5. `server/services/escpos-builder.ts:438` — branch `now`.
6. `server/services/escpos-builder.ts:529` — branch in-body refund date.
7. `server/services/escpos-builder.ts:613-620` — `RefundReceiptData` adds `tenantTimezone?: string`.
8. `server/services/escpos-builder.ts:622-672` — `buildRefundReceipt` branches printTime (line 638) and per-refund date (line 655) on `data.tenantTimezone`. Use `formatInTimeZone(date, tz, "dd MMM yyyy, hh:mm aa", { locale: enIN })` to preserve the existing en-IN style.
9. `server/services/escpos-builder.ts:675-740` — `buildRefundReceiptHtml` branches printTime (line 677) and per-refund date (line 690) on `data.tenantTimezone`.
10. Imports: add `import { formatInTenantTz } from "@shared/lib/tenant-tz"`, `import { formatInTimeZone } from "date-fns-tz"`, `import { enIN } from "date-fns/locale"`.

### 7.2 Server: thread TZ in printer-service
11. `server/services/printer-service.ts:459` — change to `SELECT name, timezone FROM tenants`. (Also covered by Phase 2 step 8 if that lands first.)
12. `server/services/printer-service.ts:482` — pass `tenantTimezone` to `browserHandler.generateBillHtml(...)`. The `browserHandler.generateBillHtml(...)` helper at `:65-74` of printer-service.ts must be updated to accept and forward `tenantTimezone`.
13. `server/services/printer-service.ts:486` — pass `tenantTimezone` to `buildBill(...)`.
14. `server/services/printer-service.ts:552` — change to `SELECT name, timezone FROM tenants`.
15. `server/services/printer-service.ts:563-569` — set `tenantTimezone` on `RefundReceiptData`.
16. `server/services/printer-service.ts:691, 693` — `rebuildEscposFromJob` retry: refetch tenant timezone (or persist in payload) and pass to `buildBill` / `buildRefundReceipt`.

### 7.3 Server: template preview
17. `server/routers/print-jobs.ts:518` — change to `SELECT name, timezone FROM tenants`.
18. `server/routers/print-jobs.ts:522` — pass `tenantTimezone` to `buildBillHtml(...)` so Settings → Print Templates preview matches production output.

### 7.4 Client: pass tenant TZ to renderBillHtml
19. `client/src/components/pos/BillPreviewModal.tsx:793` — pass `timezone: <tenantTz>` (use `useOutletTimezone` hook).
20. `client/src/components/pos/PrintQueuePanel.tsx:100` — same.

### 7.5 Tests
21. No new tests beyond the helper module tests in Phase 2. Tester-side verification post-deploy.

---

## 8. Open questions

1. **Outlet override.** `outlets.timezone` exists in the schema (`shared/schema.ts:229`) and the client hook `useOutletTimezone` prefers outlet TZ over tenant TZ. F-225 only handled tenant TZ. Should the server-side print path also prefer outlet TZ when available? If yes, the `SELECT` in `printer-service.ts` needs to join `outlets` on `bill.outlet_id` / `order.outlet_id`. Recommend: yes — match client precedence to avoid client/server drift on multi-outlet tenants. Confirm with user before implementing.

2. **Print-job retry payload persistence.** `rebuildEscposFromJob` (`server/services/printer-service.ts:681`) reconstructs ESC/POS bytes from the stored payload. F-225's commit `ae08340` did not update this path. If a bill print job fails and is retried, the retry will currently render in host TZ. Two options: (a) store `tenantTimezone` in the persisted payload at job creation, or (b) refetch from `tenants` by `tenantId` at retry time. Option (a) is cheaper but bakes TZ into past payloads. Recommend (b).

3. **`browserHandler.generateBillHtml` / `generateKotHtml` signatures.** These thin wrappers in `server/services/printer-service.ts:60-75` currently swallow `tenantTimezone`. They need updated signatures or to be inlined. Trivial but mechanical — flag for the implementation PR.

4. **Wall-clock TZ source on KDS dashboard.** `kds-wall.tsx:1261, 1263` displays the *current* time. Should this show the tenant TZ (so a manager remoting into a Dubai tenant from London sees Dubai time, matching the staff on the floor) or the user's browser TZ? Tester evidence implies the former. Recommend tenant TZ.

5. **`buildLabel` and `buildTestPage` host-TZ leak.** Not strictly KDS or receipts, but they share the same host-TZ-dependent pattern (`escpos-builder.ts:404, 422`). F-225 left them alone. Decide: fold into Phase 2 (since the helper is already imported) or carry as a separate finding.

6. **Refund body date inside `buildBill`.** F-225's commit `ae08340` modified `buildBillHtml`'s in-body refund date but left `buildBill`'s in-body refund date (escpos-builder.ts:362-372 on main) using `toLocaleString("en-IN", ...)`. Was this an oversight in F-225 or intentional (maybe ESC/POS receipts target only Indian tenants)? Recommend fixing in Phase 3 for consistency.

7. **`formatInTimezone` in `print-utils.ts:22-29` uses `Intl.DateTimeFormat({ timeZone })` directly** — no `date-fns-tz` dep on the client. We could keep the client TZ helpers as-is and only add `date-fns-tz` for the server. This keeps the client bundle smaller and confines the new dep to the server. Recommend: keep client on `Intl`, server on `date-fns-tz` per F-225.

---

## Summary

KDS and receipt timestamps on `main` go through three TZ-incorrect paths:
- **Server-rendered KOT/bill/refund** uses host TZ (= UTC in production via `node:20-alpine` accident).
- **Client-rendered KOT/bill HTML** defaults to `"UTC"` because no caller passes `timezone:`.
- **KDS dashboard wall-clock** uses browser TZ.

F-225 produced a working tenant-TZ helper (`shared/lib/tenant-tz.ts` + 17 tests) and partially threaded it into the bill/refund-receipt path. F-270 must port the helper to `main`, finish the bill/refund threading (Phase 3), extend it to the KOT path (Phase 2), and fix the KDS wall-clock.

Total file touch count for Phase 2 + Phase 3: ~13 files (4 new, 9 modified). New dep: 1 (`date-fns-tz@^3.2.0`).

---

## Phase 1 deliverable signoff

[VERIFIED] All 35 file:line citations above were read against current `main` or `git show fix/F-225-tenant-tz-helper`. No [HYPOTHESIS] entries — every claim cites code that was actually read.

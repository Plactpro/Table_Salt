# F-254 Phase 1 — Static Investigation of Production 429 Rate-Limit Storm

**Date:** 2026-05-06
**Branch:** fix/F-254-phase1-investigation off main `ee5ce45`
**Scope:** Static reading of both server-side rate limiter config and client-side query/polling/WS code for the 7 endpoints flagged in the 2026-05-05 tester report. NO code edits, NO production network access, NO npm install / dev server. Output is hypothesis generation, not fix design.

---

## TL;DR

Three findings stand out from static reading, each capable of explaining production 429s on its own:

1. The rate limiter is keyed by IP, not by user, in practice. The keyGenerator at `server/security.ts:142-146` declares `user-${user.id}` if `req.user` is set, falling back to IP. But the limiter is mounted at `server/index.ts:39` BEFORE setupAuth runs (called from registerRoutes at `server/index.ts:568`). At keyGenerator time, `req.user` is undefined. Every request is keyed by IP. Multiple users behind one office NAT share a single 120-req/min budget.

2. Two unconditional always-on pollers consume ~10 req/min just for connectivity and impersonation. `client/src/lib/sync-manager.ts:159` polls `/api/health` every 15s (4 req/min). `client/src/lib/impersonation-context.tsx:56-67` polls `/api/admin/impersonation/status` every 10s with `staleTime: 0` (6 req/min). The impersonation poller is in a context provider that wraps the entire app, firing for every logged-in user.

3. The 120 req/min limit is tight for a real session. Header + sidebar + sync-manager combine for ~20 req/min baseline before any page-specific work. Pages like kitchen.tsx and parking.tsx add 5-10+ pollers on top. One tab can plausibly hit the limit; two tabs guarantee breach.

Static reading cannot prove causality. Phase 2 needs production network captures to rank these.

---

## Server-side findings

### Rate limiter location and config

The rate limiter lives in `server/security.ts`, NOT under a `server/middleware/rate-limit*.ts` path. There is no other rate limiter file in the server tree (grep confirmed). One auxiliary in-memory limiter exists in `server/routers/ads.ts:83-92` but it is scoped to `/api/ad-impressions` only and does not interact with the 7 endpoints in scope.

**Three tiers:**

| Tier | Window | Limit | Mounted at | Keyed by | Notes |
|---|---|---|---|---|---|
| `authLimiter` | 15 min | 15 | `/api/auth/login`, `/api/auth/register` | IP | `server/security.ts:118-130` |
| `apiLimiter` | 60 sec | **120** | `/api/` (everything else) | **`user-${user.id}` if set, else IP** (see ordering bug below) | `server/security.ts:135-156` |
| `uploadLimiter` | 60 sec | 10 | `/api/upload` | `upload-${user.id}` if set, else IP | `server/security.ts:158-173` |

### Endpoint-to-tier mapping for the 7 reported endpoints

The `apiLimiter` falls back to in-memory if `REDIS_URL` is not set (`server/security.ts:97-116`). Fallback is silent — the log line `[rate-limit] Using Redis store for rate limiters` appears only on success; on failure it logs a warning and proceeds with in-memory. **Hard to distinguish "Redis configured" from "Redis silently fell back" from production logs.**

All 7 endpoints land under `apiLimiter` (60s / 120 req). None have additional per-route limits, none are whitelisted.

| Endpoint | Tier | Notes |
|---|---|---|
| `/api/health` | apiLimiter | Defined directly on `app` in `server/index.ts:139`. Not whitelisted. |
| `/api/admin/impersonation/status` | apiLimiter | Standard /api/ route. |
| `/api/security-alerts/unread-count` | apiLimiter | Standard /api/ route. |
| `/api/offers` | apiLimiter | `server/routers/tenant.ts:39`. |
| `/api/menu-items` | apiLimiter | Standard. |
| `/api/menu-categories` | apiLimiter | Standard. |
| `/api/promotions/evaluate` | apiLimiter | `server/routers/tenant.ts:158`. |

### Critical ordering bug — rate limiter runs before auth middleware

The middleware chain in `server/index.ts`:

1. **Line 39:** `setupSecurity(app)` — mounts `app.use("/api/", apiLimiter)` at `security.ts:156`.
2. **Line 114-122:** `express.json()`, `express.urlencoded()`.
3. **Line 568:** `await registerRoutes(httpServer, app)` — eventually calls `setupAuth(app)` at `routes.ts:97`, which mounts `session()`, `passport.initialize()`, `passport.session()` (`auth.ts:135-156`).

The rate limiter is mounted BEFORE the session/passport middleware. When the limiter's `keyGenerator` (`security.ts:142-146`) runs:

```ts
keyGenerator: (req: Request) => {
  const user = req.user as Record<string, unknown> | undefined;
  if (user?.id) return `user-${user.id}`;
  return req.ip || req.headers["x-forwarded-for"]?.toString() || "unknown";
},
```

`req.user` is `undefined` because passport's `deserializeUser` has not run yet. **All requests fall through to IP-keying.**

This means the design intent (per-user budget) is silently not happening. Multiple users on the same NAT (office, VPN, mobile carrier-grade NAT) share the 120-req/min budget. For a tester rig with 2-3 testers + 1 developer all on the same office IP, the effective per-user budget is 30-40 req/min.

**Confidence:** HIGH. Confirmed by reading the ordering, then confirmed again by checking `server/auth.ts:155-156` shows passport mount inside `setupAuth`. The rate limiter cannot see `req.user`.

### Health-check ordering observation

`/api/health` is registered at `server/index.ts:139` (a direct `app.get`). `setupSecurity(app)` ran at line 39. `app.use("/api/", apiLimiter)` is mounted INSIDE `setupSecurity` at `security.ts:156`. Express middleware ordering means the limiter runs first (mounted before the route was registered). So `/api/health` IS rate-limited despite its purpose as a load-balancer health probe and dev connectivity check. AWS ALB probes hit IP-keyed budget too — though those typically come from a different IP range.

### Server-side anomalies

- **No explicit whitelist for `/api/health`.** The endpoint exists for connectivity probing and is polled aggressively by the client (sync-manager). Combined with the IP-keying issue, this single endpoint contributes ~4 req/min/tab toward the shared budget.
- **No tier differentiation for read-heavy endpoints.** Menu data and promotions evaluation get the same 120/min budget as mutations. A 60-second traffic spike from menu data refetch could brown out the entire user session.
- **`apiLimiter`'s `skip` (line 147-152)** only excludes login/register from being double-counted under apiLimiter (those have their own authLimiter). Nothing else is whitelisted.
- **In-memory fallback risk.** If Redis is misconfigured or unavailable in production, each Node process keeps its own in-memory counter. With multiple Node processes (Railway can run multiple), one user's requests are distributed across processes and effective limit is `processCount × 120` per minute. Conversely, if all traffic happens to land on one process, behaviour is consistent but observed limit may differ from expected.

---

## Client-side findings

### Pollers and refetch intervals (always-on)

These pollers fire continuously while a logged-in user has the app open in any tab, regardless of which page they are on. They contribute baseline traffic before any page-specific work.

| Source | Endpoint | Interval | Effective rate | Notes |
|---|---|---|---|---|
| `client/src/lib/sync-manager.ts:159` | `/api/health` | 15s (`setInterval`) | **4 req/min** | Connectivity check. Always on. Uses raw `fetch`, bypasses TanStack Query. |
| `client/src/lib/sync-manager.ts:163, 578-584` | `/api/menu-items`, `/api/menu-categories`, `/api/offers` | 120s (`setInterval`) | **1.5 req/min total** (3 calls per 2-min window) | `refreshAllConfigs()`. Always on. Skipped only when `_status === "offline"`. |
| `client/src/lib/impersonation-context.tsx:56-67` | `/api/admin/impersonation/status` | 10s (`useQuery refetchInterval`) | **6 req/min** | `staleTime: 0`, `refetchOnMount: "always"`, `refetchOnWindowFocus: "always"`. Provider wraps the entire app — fires for **every** logged-in user, not just admins. |
| `client/src/components/layout/sidebar.tsx:299-308` | `/api/security-alerts/unread-count` | 30s | **2 req/min** | `enabled: isSecurityRole` (owner / hq_admin / franchise_owner only). |
| `client/src/components/layout/sidebar.tsx:311-320` | `/api/table-requests/pending-count` | 30s | **2 req/min** | `enabled: canSeeLiveRequests` (most roles). |
| `client/src/components/layout/header.tsx:146-155` | `/api/inventory-alerts/count` | 30s | **2 req/min** | `enabled: canSeeInventoryAlerts`. |
| `client/src/components/layout/header.tsx:157-166` | `/api/inventory-alerts` | 30s | **2 req/min** | Same gate as above. |
| `client/src/components/alert-listener.tsx:45` | (alert endpoint) | 60s | **1 req/min** | Mounted in app shell. |

**Cumulative baseline for a privileged role on one tab: ~20 req/min.** Almost all of it is `useQuery refetchInterval` polling; one piece (`sync-manager` connectivity) uses raw `setInterval` + `fetch`, which is invisible to TanStack Query's cache and request dedup.

Page-level pollers stack on top of this baseline. `client/src/pages/dashboards/kitchen.tsx` alone has 9 `refetchInterval` declarations (15s-300s, several at 20-30s), and `client/src/pages/modules/parking.tsx` has 14+ pollers (15s-120s). Opening kitchen view on a tab already running the baseline can push total traffic toward 50-60 req/min, leaving little room before the 120/min ceiling.

### Per-endpoint subscriber breakdown for the 7 reported endpoints

| Endpoint | Subscriber count | Polling? | Notes |
|---|---|---|---|
| `/api/health` | 2 | **Yes — aggressive** | (a) `client/src/lib/sync-manager.ts:168` raw `fetch` every 15s. (b) `client/src/pages/admin/system-health.tsx:142-149` `useQuery` every 30s, admin-only. |
| `/api/admin/impersonation/status` | 1 | **Yes — most aggressive** | `impersonation-context.tsx` every 10s with `staleTime: 0`, app-wide. |
| `/api/security-alerts/unread-count` | 1 | Yes (30s) | `sidebar.tsx`, security roles only. |
| `/api/offers` | 4 | **Yes — via sync-manager refresh** | (a) `pages/modules/offers.tsx:128`, (b) `pages/modules/events.tsx:436`, (c) `pages/modules/crm.tsx:215`, (d) `sync-manager.ts:583` (refresh every 120s). Pages a-c use default `staleTime: Infinity` (no refetch); only sync-manager actually polls. |
| `/api/menu-items` | ~10 | Yes (via sync-manager) | Many components subscribe (pos.tsx, hq-console, inventory-hub, orders-hub, outlets, menu, kiosk-management, etc.). All use default `staleTime: Infinity` and rely on shared cache key. Sync-manager `refreshAllConfigs` polls every 120s. The `/api/menu-items?limit=500` variant in `pos.tsx:661` and `menu.tsx:322` is the heavy version. |
| `/api/menu-categories` | ~7 | Yes (via sync-manager) | Same pattern as `/api/menu-items`. |
| `/api/promotions/evaluate` | 1 | **Yes — fires on cart mutation** | `pos.tsx:850-859`. POST query whose key includes the full `evaluatePayload` (cart items + subtotal + channel + orderType). `staleTime: 5000`. Each new cart shape produces a new cache key and a new request. Adding/removing items rapidly creates a burst — every keystroke or click on a menu item triggers a new POST. |

### useEffect fetch loops

Static reading did not find a clear "useEffect with object/array dep recreated on every render" pattern that would create an infinite fetch loop. Specifically:

- `useEffect` calls in `settings.tsx`, `auth.tsx`, `pos.tsx` either have stable primitive deps or use `useCallback`/`useMemo` for object deps.
- `client/src/pages/modules/pos.tsx:850-859` (`/api/promotions/evaluate`) uses `useMemo` on `evaluatePayload` with `[cart, subtotal, orderType]` — deps are arrays/numbers/strings, but `cart` is a referentially-new array on every cart mutation. This is **intended**: each cart change SHOULD re-evaluate promotions. But the mechanism turns every POS interaction into a server round-trip with no client-side debounce.
- No `setInterval` usage with interval < 15s found outside of WebSocket heartbeat (25s ping in `use-realtime.ts:37-42`).

**Worth flagging but not a bug:** `pos.tsx:850-859` `evaluatePayload` queryKey includes the entire cart array. Each cart object reference change = new query key = new POST. On a busy POS session with rapid item addition (10-20 items in 30 seconds), this alone produces 10-20 requests. Combined with the IP-keyed limiter, multiple cashiers on the same office IP entering orders simultaneously could spike well past 120/min.

### WebSocket reconnect side effects

WS client lives in `client/src/hooks/use-realtime.ts:8-147` (`class RealtimeClient`). Reconnect strategy:

- Exponential backoff: starts at 1000ms, doubles each retry, caps at 30000ms. `MAX_RECONNECT_ATTEMPTS = 10`. Code 1006 (abnormal close) retries fast (1000ms).
- Reconnect on `onclose` schedules `_connect()` via `setTimeout`.
- Heartbeat: 25s ping over WS, NOT HTTP.

Critical: **`onopen` does NOT invalidate queries or trigger HTTP refetches.** It only resets `delay`, `reconnectCount`, `maxAttemptsReached`, and starts the heartbeat (`use-realtime.ts:97-103`). No thundering herd of HTTP refetches at reconnect time.

WS-driven query invalidation does happen at the application layer — `useRealtimeEvent` handlers in pages like `kds/coordinator.tsx:171-176`, `dashboards/wastage-dashboard.tsx:419-443`, and `modules/delivery.tsx:302-318` call `qc.invalidateQueries` when specific server events arrive. This is on a per-event basis, not a per-reconnect basis. Server would have to push an event burst to cause an HTTP burst here, and there is no static evidence of that pattern.

**One unknown:** when the WS reconnects after a brief disconnect, does the server send a state-snapshot event that triggers handlers to invalidate broadly? Static reading cannot answer this — needs server WS-handler inspection or production observation. Logged as an open question.

---

## Hypothesis ranking

Five hypotheses, ranked by static-evidence strength. Each is independently capable of producing 429s; in practice multiple are likely co-occurring and amplifying each other.

### H-1 — IP-keying ordering bug (most likely structural cause)

**Evidence from code:** `server/security.ts:142-146` (keyGenerator falls back to IP when `req.user` is undefined) + `server/index.ts:39` (setupSecurity mounted) + `server/index.ts:568` (registerRoutes called, which triggers setupAuth) + `server/auth.ts:155-156` (passport.initialize / passport.session mounted inside setupAuth). Order: rate limiter middleware is registered before session/passport, so `req.user` is always undefined at limiter time.

**Confirms in production:**
- A second user logging in from the same IP receives 429s on the same approximate schedule as user A — they share the budget.
- Multiple browser tabs by one user halve the per-tab effective budget (because both tabs accumulate against the same IP key).
- 429 response headers show `RateLimit-Remaining` decrementing at a rate matching the SUM of all users on the IP, not per-user.

**Rules out in production:**
- 429s are uncorrelated between users on the same IP — user A getting throttled doesn't affect user B.
- Two tabs by one user produce identical 429 timing to one tab (i.e. the limiter sees them as separate buckets).

**Severity if confirmed:** high. Multi-user offices, VPN'd tester rigs, mobile carrier-grade NAT users all share budget. The published 120/min limit becomes effectively `120 / N_users_per_IP`.

### H-2 — Unconditional always-on pollers consume baseline

**Evidence from code:** `client/src/lib/sync-manager.ts:159` (15s /api/health = 4 req/min), `client/src/lib/impersonation-context.tsx:56-67` (10s /api/admin/impersonation/status with `staleTime: 0` and `refetchOnWindowFocus: "always"` = 6 req/min), `sync-manager.ts:163, 578-584` (120s sync of menu/categories/offers = 1.5 req/min), plus 4-6 sidebar/header pollers at 30s each (~8-12 req/min). Total baseline: ~20 req/min on one tab for a privileged role, before any page-specific work.

**Confirms in production:**
- Pause sync-manager poll OR widen impersonation poll to 60s in a controlled test build; 429 frequency drops noticeably even on idle pages.
- Network panel on a Settings page (not Kitchen, not Parking) shows ~20 req/min sustained — meaning all 20 are baseline pollers, not page work.

**Rules out in production:**
- Even with all baseline pollers paused, 429s persist at the same frequency. The cause is then page-level pollers, mutations, or burst patterns.

**Severity if confirmed:** medium-high. The impersonation poll in particular fires for every logged-in user despite only being meaningful for super-admins running support sessions; widening it or gating it on admin role would cut ~6 req/min/tab from baseline for non-admin users.

### H-3 — 120/min ceiling too tight for normal multi-tab use

**Evidence from code:** `server/security.ts:138` sets `limit: 120, windowMs: 60_000`. Combined with H-2 baseline (~20 req/min) and observed page-level pollers in `kitchen.tsx` (9 refetchInterval declarations) and `parking.tsx` (14+ pollers), a single tab on a busy page can plausibly run 50-70 req/min steady-state. Two tabs by one user (e.g. Kitchen + POS) easily exceed 120.

**Confirms in production:**
- 429s cluster around moments of high local activity (multiple tabs, cart entry, page transitions causing remount-and-refetch) rather than steady polling.
- A single tab on Settings (light page) almost never 429s; Kitchen + POS in two tabs frequently 429s.

**Rules out in production:**
- 429s appear evenly spaced regardless of page or tab count. That points to a per-window cap being hit by polling alone (H-2 territory).

**Severity if confirmed:** medium. Solvable by raising the limit OR by tier differentiation (read endpoints get a higher cap). Tightly coupled with H-1 — if H-1 is fixed, the per-user budget effectively rises and H-3's tightness may dissolve.

### H-4 — `/api/promotions/evaluate` burst from cart mutations

**Evidence from code:** `client/src/pages/modules/pos.tsx:850-859`. `useQuery` keyed by `["/api/promotions/evaluate", evaluatePayload]` where `evaluatePayload` includes the entire cart array. Each cart mutation produces a new query key and a new POST. No debounce. `staleTime: 5000` does not help across distinct keys. A POS session adding 10-20 items in 30 seconds produces 10-20 requests from this single endpoint.

**Confirms in production:**
- 429s on `/api/promotions/evaluate` cluster during cart entry, absent during idle.
- Network panel during cart entry shows one POST per cart edit, no debounce gap.

**Rules out in production:**
- 429s on this endpoint are uniform across the session, not clustered around cart edits. (Suggests baseline polling is the cause, not bursts.)
- Tester reports show /api/promotions/evaluate 429s only when carts are not being edited.

**Severity if confirmed:** medium. Localized to POS workflow; cashiers entering orders rapidly are most affected. Fix: client-side debounce (e.g. 300ms after last cart edit), or strip the cart from the query key and use a stable id.

### H-5 — Multi-process Redis dilution / silent in-memory fallback

**Evidence from code:** `server/security.ts:97-116`. If `REDIS_URL` is unset OR Redis connection fails, each Node process maintains its own in-memory counter. Fallback is logged as a warning but is otherwise silent. With multiple Node processes (possible on Railway depending on plan), one user's requests are distributed across counters and the effective limit is `processCount × 120` — but only IF traffic is balanced. If traffic sticks to one process for sticky-session reasons, the user sees the baseline 120 limit, which differs from the design intent.

**Confirms in production:**
- Railway env vars don't include `REDIS_URL`, OR application logs show `[rate-limit] Could not connect to Redis, using in-memory store` on startup.
- Two requests to the same endpoint from the same browser session land on different processes (visible via `X-Process-Id` if logged) AND show different `RateLimit-Remaining` values.

**Rules out in production:**
- Application logs show `[rate-limit] Using Redis store for rate limiters` cleanly on every process startup.
- All requests for a session show coherent `RateLimit-Remaining` decrementing.

**Severity if confirmed:** low-to-medium. Behaviorally inconsistent (sometimes lenient, sometimes strict), making the bug hard to reproduce. May explain why testers see intermittent 429s where one expects either always or never.

---

## Phase 2 recommendation

Phase 2 is production observation, not code change. Execute in this order:

### Phase 2 data capture (testers + ops)

1. **One tester opens DevTools Network panel, filters to `/api/`, records 60 seconds of normal activity on one tab on a typical workflow page (Kitchen or POS).** Capture: total request count, request count per endpoint, 429 count per endpoint, response headers from at least one 429 (`RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`).
2. **Repeat with two tabs open.** Same capture. Confirms or rules out H-3.
3. **Two testers log in simultaneously from the same office IP.** Each captures their own DevTools panel for 60 seconds. Compare: do their 429s correlate in time? Confirms or rules out H-1.
4. **Ops checks Railway environment variables for `REDIS_URL`** and checks application logs from a recent deploy for `[rate-limit] Using Redis store for rate limiters` vs `[rate-limit] Could not connect to Redis`. Confirms or rules out H-5.
5. **Tester records a 30-second cart-entry session in POS** with rapid item additions. Capture `/api/promotions/evaluate` request count and 429 count specifically. Confirms or rules out H-4.

### Likely fix shapes (depend on which hypotheses confirm)

- **H-1 confirmed → swap middleware order.** Move `setupSecurity` AFTER `setupAuth` in `server/index.ts`, OR move just the `app.use("/api/", apiLimiter)` line out of `setupSecurity` and re-mount it after passport. One-file change, ~5 lines. Highest leverage fix.
- **H-2 confirmed → widen and gate baseline pollers.** Change impersonation poll to 60s and gate `enabled: user?.role === "super_admin"` (only meaningful for support staff). Optionally migrate sync-manager's raw `fetch("/api/health")` to a TanStack Query so it benefits from dedup.
- **H-3 confirmed → raise `apiLimiter.limit` to 240** OR introduce a separate read-tier (e.g. 300/min for GETs, 60/min for mutations). Server-only change in `security.ts`.
- **H-4 confirmed → debounce `/api/promotions/evaluate`.** Client-side fix in `pos.tsx`. Either wrap `evaluatePayload` in a 300ms debounce, OR change the query key to a stable cart-id and let staleTime do its job.
- **H-5 confirmed → configure `REDIS_URL` on Railway** AND change the silent fallback to a startup error in production (so Redis misconfiguration is loud, not silent). Server-only change.

### Single bug or umbrella?

**Umbrella.** H-1 is structurally true and amplifies every other hypothesis: any per-user budget gets divided across all users on the same IP. Fix order should be: H-1 first (one-line ordering fix), then re-measure with Phase 2 captures. After H-1, the budget per actual user is 4-5× larger, and H-2/H-3/H-4 may dissolve without further code change. If 429s persist after H-1, attack the next-highest signal from the recapture.

This mirrors the F-256 pattern (Phase 1 found three sub-bugs, Phase 2a fixed the cleanest one first, deferred H-2/H-3 pending recon). Recommend the same structure: F-254a = H-1 fix, then re-measure before committing to F-254b/c/d/e.

---

## Open questions

- **Q-F254-1:** Is `REDIS_URL` configured on Railway in production? Static reading cannot tell. Ops needs to check env vars and startup logs.
- **Q-F254-2:** How many Node processes does Railway run for this app? Affects H-5 severity. Railway Pro plan can run multiple replicas.
- **Q-F254-3:** Are testers behind a single shared IP (office NAT, mobile carrier-grade NAT, VPN)? Directly affects how much H-1 amplifies the problem in their specific reports.
- **Q-F254-4:** Does the WebSocket server send a state-snapshot event on reconnect that would trigger client `useRealtimeEvent` handlers to invalidate queries en masse? Static reading of client code can't answer; needs `server/routes.ts` or wherever the WS server lives, plus reconnect-flow inspection.
- **Q-F254-5:** Are the 7 endpoints in the tester report the only ones being 429'd, or just the most common in tester DevTools captures? If the rate limiter is hitting many endpoints uniformly (which it should under H-1/H-3), the listed 7 are an artifact of which pages testers visited rather than a special set. Worth confirming with broader DevTools captures in Phase 2.
- **Q-F254-6:** What is the AWS ALB health-check rate against `/api/health`? If frequent (e.g. every 5s), ALB itself contributes to the IP-keyed budget — though the source IP is typically the ALB's, not the tenant's. Worth confirming the ALB IP range is whitelisted or at minimum lands in a different bucket.

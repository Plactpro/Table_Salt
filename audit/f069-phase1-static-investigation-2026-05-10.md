# F-069 Phase 1 — Static Investigation
## Loyalty config identity-forgery IDOR

**Date:** 2026-05-10
**Branch:** chore/f069-phase1-investigation
**Scope:** read-only investigation of `server/routers/customers.ts:150-227` and the surrounding tenant-resolution architecture. No code changes in this phase.
**F-069 source row:** `audit/FINDINGS.md:77` — `Critical | IDOR | server/routers/customers.ts | 150-227 | Loyalty tier config: uses req.headers["x-tenant-id"] instead of user.tenantId — full cross-tenant loyalty data read/write/delete | Open`

---

## 1. Goal of Phase 1

Produce a verifiable spec for the F-069 fix:
- Name every file:line where the fix needs to apply
- Identify any legitimate cross-tenant flows the fix must preserve
- Confirm whether the same x-tenant-id header anti-pattern exists elsewhere in the codebase (so the fix scope is bounded)
- Surface the canonical tenant-resolution pattern this codebase already uses everywhere else
- Provide a Phase 2 implementation plan with exact line-level changes

Phase 1 does **not** edit any application code. The only file written is this document.

---

## 2. F-069 site analysis (Group A) — `server/routers/customers.ts`

### 2.1 File structure

`server/routers/customers.ts` is **228 lines, 15 endpoints** registered via `registerCustomersRoutes(app)` [VERIFIED]. The file splits cleanly into two zones:

- **Lines 9–145 — "customers core" (10 endpoints)** — all use the canonical `req.user.tenantId` pattern
- **Lines 148–227 — "LOYALTY TIER CONFIG" section header at line 148 (5 endpoints)** — all use the broken `req.headers["x-tenant-id"]` pattern

The section break at line 148 (`// ============ LOYALTY TIER CONFIG ============`) is an explicit visual marker that the loyalty-tier code was added as a discrete block, almost certainly by a different author or at a different time. This supports Q-026's hypothesis: developer error in one section, not project-wide convention.

### 2.2 The five broken endpoints — citation table

| # | Method + Path | Handler line | Header read line | DB op(s) | Auth gate |
|---|---------------|--------------|------------------|----------|-----------|
| 1 | `GET /api/loyalty-tier-config` | customers.ts:150 | customers.ts:151 | `SELECT * FROM loyalty_tier_config WHERE tenant_id = $1` (line 154) | `requireAuth` (no role) |
| 2 | `POST /api/loyalty-tier-config` | customers.ts:160 | customers.ts:161 | `DELETE FROM loyalty_tier_config WHERE tenant_id = $1` (line 165) + `INSERT INTO loyalty_tier_config ...` loop (line 168) | `requireAuth` (no role) |
| 3 | `POST /api/loyalty-tier-upgrade` | customers.ts:175 | customers.ts:176 | `SELECT loyalty_tier_config WHERE tenant_id = $1` (line 179) + `SELECT customers... WHERE tenant_id = $1` (line 185) + `UPDATE customers SET loyalty_tier WHERE id=$ AND tenant_id=$` (line 198) + `INSERT INTO loyalty_tier_log` (line 200) | `requireAuth` (no role) |
| 4 | `GET /api/loyalty-tier-log` | customers.ts:209 | customers.ts:210 | `SELECT * FROM loyalty_tier_log WHERE tenant_id = $1` (line 213) | `requireAuth` (no role) |
| 5 | `GET /api/loyalty-tier-stats` | customers.ts:219 | customers.ts:220 | `SELECT loyalty_tier, COUNT(*)... FROM customers WHERE tenant_id = $1` (line 223) | `requireAuth` (no role) |

[VERIFIED — full file read.]

### 2.3 Concrete attack surface

All five endpoints accept `requireAuth` only (no role gate). Any authenticated user — kitchen, cashier, waiter, even the lowest-privilege `delivery_agent` — can:

1. **Set `X-Tenant-Id: <victim-tenant-uuid>` header** on any of these requests
2. **Server trusts the header value verbatim** at the `pool.query` parameterized boundary
3. SQL is parameterized so this is **not** SQL injection — but the trusted-but-forged parameter does the cross-tenant access

**Worst-case operations possible:**

- **`POST /api/loyalty-tier-config` (endpoint #2):** First does `DELETE FROM loyalty_tier_config WHERE tenant_id = $1` on the forged tenant, then re-INSERTs whatever tier configuration the attacker provides. **Net effect: an attacker can wipe and rewrite any tenant's loyalty configuration with arbitrary tier names, point multipliers, and discount percentages.** Combined with endpoint #3, this enables a chain attack: rewrite the config to set "min_spend = 0" for a high-discount tier, then trigger endpoint #3 to bulk-promote every customer in the victim tenant to that tier.

- **`POST /api/loyalty-tier-upgrade` (endpoint #3):** Reads ALL customer records from the forged tenant (`SELECT c.id, c.name, c.loyalty_tier, c.loyalty_points, COALESCE(SUM(o.total)...` at line 185 — note this also exposes order totals via the JOIN), recomputes tier assignments per the (possibly attacker-controlled) tier config, then `UPDATE customers SET loyalty_tier = $1 WHERE id = $2 AND tenant_id = $3` and `INSERT INTO loyalty_tier_log ...`. **Cross-tenant customer record mutation + audit-log injection.**

- **`GET /api/loyalty-tier-log` (endpoint #4):** Returns 100 most recent loyalty tier change records for the forged tenant, JOINed with `customers.name`. **Cross-tenant audit-log + customer-name read.**

- **`GET /api/loyalty-tier-stats` (endpoint #5):** Returns aggregate customer counts grouped by tier for the forged tenant. **Cross-tenant business-intelligence leakage** (tells an attacker how many "platinum" vs "bronze" customers a competitor has).

### 2.4 What's NOT broken

Lines 9–145 of the same file are correct:

| Line | Endpoint | Tenant resolution |
|------|----------|-------------------|
| customers.ts:11, 19, 26-27 | GET /api/customers | `req.user.tenantId` |
| customers.ts:34-35 | POST /api/customers | `req.user.tenantId` |
| customers.ts:41, 49, 55 | GET /api/customers/lookup | `req.user.tenantId` |
| customers.ts:88-89 | GET /api/customers/:id | `req.user.tenantId` (via `getCustomerByTenant`) |
| customers.ts:96, 100, 107 | PATCH /api/customers/:id | `req.user.tenantId` (via `getCustomerByTenant` + `updateCustomerByTenant`) |
| customers.ts:114-115 | DELETE /api/customers/:id | `req.user.tenantId` (via `deleteCustomerByTenant`) |
| customers.ts:120-121 | GET /api/customers/by-tier/:tier | `req.user.tenantId` |
| customers.ts:126-127 | GET /api/customers/by-tag/:tag | `req.user.tenantId` |
| customers.ts:131-145 | GET /api/customers/:id/loyalty-history | `req.user?.tenantId` (line 134) |

[VERIFIED — these endpoints will not be touched by the fix.]

---

## 3. Anti-pattern survey (Group B) — codebase-wide search

### 3.1 What was searched

Four independent grep patterns against the full `server/` tree:

1. `x-tenant-id` (case-insensitive)
2. `tenant-id` (broader — would catch `Tenant-Id`, `TENANT-ID`, etc.)
3. `headers[.tenant` (alternate access pattern)
4. `req\.body\.tenantId` literal
5. `\{\s*tenantId\s*\}\s*=\s*req\.body` (destructured form)
6. `req\.query\.tenantId`
7. `req\.params\.tenantId`

### 3.2 Results

| Pattern | Matches outside customers.ts |
|---------|------------------------------|
| `x-tenant-id` (any case) | **0** [VERIFIED] |
| `tenant-id` (any case) | **0** [VERIFIED] |
| `headers[.tenant` | **0** [VERIFIED] |
| `req.body.tenantId` literal | **0** [VERIFIED] |
| Destructured `{ tenantId } = req.body` | **0** [VERIFIED] |
| `req.query.tenantId` | **0** [VERIFIED] |
| `req.params.tenantId` | **0** [VERIFIED] |

**The anti-pattern is fully contained to `server/routers/customers.ts:151,161,176,210,220`.** No other endpoint in the server reads a tenant identifier from a client-controlled location. This is the strongest possible bound on fix scope: the entire bug class is 5 lines in 1 file.

The 7 "global tables" referenced in Q-010 (`session`, `platformSettings`, etc.) and the unauthenticated webhook surface (`channels.ts`, `razorpay.ts`) do NOT use this pattern either — they have their own gating mechanisms (HMAC validation, super_admin role, etc.) that are tracked under separate findings (F-189, F-050).

### 3.3 Client-side check

Grepped `client/src/` for `x-tenant-id` / `X-Tenant-Id`: **0 matches** [VERIFIED]. No legitimate client code sets this header anywhere in the codebase.

This means the 5 broken endpoints have **no callers in the legitimate frontend**. Confirming with a complementary grep for `loyalty-tier` in `client/src/`: 3 matches found, all for tier *display* (BI dashboard at `bi-dashboard.tsx:391`, BillPreviewModal at `BillPreviewModal.tsx:1449`, promotions form at `promotions.tsx:884`) — **none** of them call `/api/loyalty-tier-config`, `/api/loyalty-tier-upgrade`, `/api/loyalty-tier-log`, or `/api/loyalty-tier-stats` [VERIFIED].

The tier *configuration* UI either doesn't exist yet, exists but uses a different (correct) endpoint that I haven't found, or was never wired. The endpoints are dead from the legitimate client perspective but **server-side reachable via direct HTTP call (curl, browser devtools, any authenticated session of any role)**.

This explains how the bug shipped without breaking the UI: nothing in the client exercises the broken pattern. It also means the fix is low-regression-risk — there is no legitimate frontend caller to break.

---

## 4. Legitimate cross-tenant flows (Group C)

The fix swaps `req.headers["x-tenant-id"]` for `req.user.tenantId`. Before doing that, every legitimate flow that needs to operate cross-tenant must work through a mechanism that **also** sets `req.user.tenantId` correctly (or doesn't go through these endpoints at all).

### 4.1 Impersonation flow

**Mechanism:** session manipulation via `passport.req.login()`, NOT a header.

[VERIFIED from `server/admin-routes.ts:136-227`.]

The flow:
1. Super admin POSTs to `/api/session/impersonate/:userId` (or alias `/api/admin/impersonate/:userId`) — gated by `requireSuperAdmin` (admin-routes.ts:292-293)
2. Server fetches the target user (admin-routes.ts:145), refuses if target is super_admin or deactivated (admin-routes.ts:147-152)
3. Inserts an `impersonation_sessions` row with `tenant_id = target.tenantId, super_admin_id, accessMode (default READ_ONLY), reason, ip_address` (admin-routes.ts:170-189)
4. Backs up the super admin's identity into `req.session.superAdminBackup` (admin-routes.ts:212)
5. Calls **`req.login(target, { keepSessionInfo: true })`** at admin-routes.ts:208 — this is passport's session switch. After this returns, `req.user` IS the target user, including `req.user.tenantId === target.tenantId`.

**Implication for F-069:** When a super admin is impersonating, `req.user.tenantId` correctly resolves to the impersonated tenant's ID at the loyalty-tier endpoints (because passport has switched the session). The fix to use `req.user.tenantId` therefore preserves impersonation semantics — no regression.

**Additional safety layer:** A global Express middleware at admin-routes.ts:363-388 enforces READ_ONLY mode by default — POST/PUT/PATCH/DELETE return 403 unless the path is in `READ_ONLY_WHITELIST` (admin-routes.ts:354-361). The whitelist contains 6 entries, none of which are loyalty-tier paths. So even after the fix, an impersonating super admin in default READ_ONLY mode CANNOT call `POST /api/loyalty-tier-config` or `POST /api/loyalty-tier-upgrade`. They'd have to first call `/api/admin/impersonation/unlock-edit` (admin-routes.ts:391-428) which requires a written reason and respects the tenant's `tenant_access_preferences.allow_edit_mode` setting.

This is a stricter posture than the current broken code, where any super admin (impersonating or not) could simply set the header to any tenant UUID and call the endpoint. **The fix actually tightens the impersonation gate, not loosens it.**

### 4.2 Franchise / multi-outlet flow

[VERIFIED from `server/routers/franchise.ts` (full read, 280 lines) and `shared/permissions-config.ts:68-77`.]

Despite the name "franchise_owner," the role is **single-tenant-scoped**. franchise_owner has 35/35 identical permissions to owner (this is F-151 — confirmed identical arrays in permissions-config.ts:58-67 vs 68-77), and all 18 endpoints in franchise.ts use:

- `requireRole("owner")` or `requireRole("owner", "manager")` — **never `franchise_owner` explicitly**
- `req.user.tenantId` for tenant scoping — including the multi-outlet endpoints like `GET /api/regions` (franchise.ts:14-19), `POST /api/franchise-invoices/calculate` (franchise.ts:72-89), and `GET /api/hq/outlet-kpis` (franchise.ts:136-182)

The "franchise" model in this codebase: ONE tenant operates MULTIPLE outlets, where some outlets are franchises (`outlets.is_franchise = true`). Tenant boundary stays at tenant, NOT at outlet/franchise. There is no real "headquarters tenant viewing child franchise tenants" cross-tenant flow.

**Implication for F-069:** No franchise flow uses x-tenant-id, and no franchise flow needs to operate cross-tenant. The fix preserves the franchise model without modification.

### 4.3 Webhooks / unauthenticated public surfaces

[VERIFIED from F-069's location and surrounding context.]

The 5 broken endpoints all sit behind `requireAuth`. Webhooks and unauthenticated routes do not pass through this code path and are out of scope for this fix. Webhook tenant routing (Razorpay, aggregator) is separately tracked under F-050, F-189, F-190.

### 4.4 hq_admin / multi-outlet admin

`hq_admin` (permissions-config.ts:78-84) has 19 permissions including `manage_crm`, but no cross-tenant access — it's tenant-scoped like every other role except `super_admin`.

### 4.5 Conclusion

**No legitimate flow that runs through the loyalty-tier endpoints needs the x-tenant-id header to operate cross-tenant.** Impersonation already switches `req.user` via passport, and there is no other cross-tenant mechanism in this codebase. The fix is safe to apply.

---

## 5. Canonical tenant resolution pattern (Group D)

### 5.1 How `req.user.tenantId` is populated

[VERIFIED from `server/auth.ts:122-238` and `server/auth.ts:241-295`.]

1. `setupAuth(app)` at auth.ts:122 registers `express-session` + `passport.session()`
2. `passport.serializeUser` stores `user.id` only (auth.ts:186-188)
3. `passport.deserializeUser` (auth.ts:190-238) calls `storage.getUserUnchecked(id)` and the returned user object — including `tenantId` — becomes `req.user` for the lifetime of the request
4. `requireAuth` middleware (auth.ts:241-295) then validates session and uses `req.user?.tenantId` itself at line 269 (the subscription-grace promotion logic)

After `requireAuth` passes, `req.user.tenantId` is guaranteed to be the authenticated user's tenant ID (or, in impersonation, the impersonated user's tenant ID — because passport has switched the session).

### 5.2 The canonical pattern in this codebase

The exact same file (customers.ts) demonstrates the pattern in 10 places. The simplest form (customers.ts:34-35):

```ts
app.post("/api/customers", requireAuth, async (req, res) => {
  const user = req.user as any;
  const customer = await storage.createCustomer({ ...req.body, tenantId: user.tenantId });
  res.json(customer);
});
```

A variant that uses optional chaining (customers.ts:131-145):

```ts
app.get("/api/customers/:id/loyalty-history", requireAuth, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const tenantId = req.user?.tenantId;
    const { rows } = await pool.query(
      `SELECT * FROM loyalty_transactions
       WHERE customer_id = $1 AND tenant_id = $2
       ORDER BY created_at DESC LIMIT 50`,
      [id, tenantId]
    );
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});
```

The same pattern appears in `server/routers/franchise.ts` (every endpoint, lines 14-280), `server/admin-routes.ts:402` (`(req.user as { tenantId?: string })?.tenantId` — strongly typed variant), and across all routers I sampled. There is no existing convention for reading tenant from headers.

### 5.3 Exact line-level fix

For each of the 5 broken header-read lines, the substitution is mechanical:

```ts
// BEFORE (the bug)
const tenantId = req.headers["x-tenant-id"] as string;
if (!tenantId) return res.status(400).json({ error: "Missing tenant" });

// AFTER (canonical)
const tenantId = (req.user as any).tenantId as string;
if (!tenantId) return res.status(400).json({ error: "Missing tenant" });
```

The `if (!tenantId)` defense-in-depth check can be retained as-is (it's now defending against an unreachable case — `req.user` is set by `requireAuth` — but harmless to keep).

### 5.4 TypeScript type considerations

[VERIFIED from auth.ts and customers.ts handler signatures.]

- The 5 broken handlers use `(req, res)` without explicit type annotations. Express's `Request` type does NOT include `user` — that's added at runtime by passport. The canonical pattern in this file casts via `req.user as any` (10 examples, see §5.2).
- One handler in this file uses `(req: any, res: any)` explicitly (customers.ts:131). This works too.
- There is no typed `AuthenticatedRequest` interface anywhere in `server/` that would let us avoid `any` — and adopting one is out of scope for the F-069 fix (would touch every router file).
- Recommended Phase 2 approach: `(req.user as any).tenantId` — matches existing convention in the same file (lines 11, 34, 41, 88, 96, 114, 120, 126).

### 5.5 What the fix does NOT need

- No new middleware
- No schema change (loyalty_tier_config table already has tenant_id column, queries already correctly include `WHERE tenant_id = $1`)
- No client-side change (no client calls these endpoints today — see §3.3)
- No DB migration
- No package install
- No test infrastructure setup (Phase 2 should add a regression test, but it doesn't require new packages — vitest is already in the codebase)

---

## 6. Phase 2 plan — exact implementation

**Branch name:** `fix/F-069-loyalty-config-tenant-resolution`
(Per CLAUDE.md Hard Rule #2 — fix branch must exist before any application-code edits.)

### 6.1 The change

Single file: `server/routers/customers.ts`. Five line replacements:

| Line | Replace | With |
|------|---------|------|
| 151 | `const tenantId = req.headers["x-tenant-id"] as string;` | `const tenantId = (req.user as any).tenantId as string;` |
| 161 | (same) | (same) |
| 176 | (same) | (same) |
| 210 | (same) | (same) |
| 220 | (same) | (same) |

Total diff: 5 lines changed, 0 added, 0 removed.

### 6.2 Suggested cleanup, NOT required for F-069

The `if (!tenantId)` defense-in-depth check at lines 152, 162, 177, 211, 221 becomes effectively unreachable after the fix (because `requireAuth` ensures `req.user` is set before the handler runs). It is safe to keep as-is to limit blast radius of the fix, OR can be removed in a follow-up. **Recommendation: keep it for now.** Don't expand fix scope.

### 6.3 Test plan

**Unit/integration test (recommended):**
- Add a vitest test case that constructs a request with a session for tenant A but with `X-Tenant-Id: <tenant-B-uuid>` header set
- Assert the response data is for tenant A (or, if no loyalty config exists for tenant A, returns empty array — never tenant B's data)
- Test should target `GET /api/loyalty-tier-config` since it's read-only and easiest to assert on

**Manual production verification (post-deploy):**
- From an authenticated session of any non-super-admin role, attempt: `curl -H "X-Tenant-Id: <other-tenant-uuid>" -H "Cookie: ts.sid=..." https://inifinit.com/api/loyalty-tier-config` — should return ONLY the requesting user's tenant data, never the forged tenant

### 6.4 Rollback shape

The fix is 5 line edits in 1 file with no schema changes. Rollback = `git revert <fix-commit>`. No data migration, no state to undo.

### 6.5 Sequencing — does Phase 2 ship before or after the IDOR cluster?

**Recommend: F-069 fix ships standalone, BEFORE F-031/032/033/066/067/068.**

Rationale: F-069 is identity-forgery (any role can pretend to be any tenant). The other 6 are param-forgery (cross-tenant via known tenant context, bypassing the tenant_id WHERE clause). F-069 is strictly worse because it doesn't even require the attacker to be in their own tenant correctly — they can just claim to be anyone. Closing F-069 first removes the most arbitrary attack vector and is structurally simpler (5 lines, 1 file vs. multiple endpoints across 1 file).

---

## 7. Cross-cluster implications

The IDOR cluster as triaged on 2026-05-10 is F-031, F-032, F-033, F-066, F-067, F-068, F-069. Quick assessment of how the F-069 fix affects the others:

| Finding | Description | Affected by F-069 fix? |
|---------|-------------|------------------------|
| F-031 | `POST /api/orders/transfer-table` no tenant_id check | **No.** Different file (orders.ts:1265), different bug class (missing WHERE clause, not header trust). Fix is independent. |
| F-032 | `POST /api/orders/merge-tables` no tenant_id check | **No.** Same as F-031. Different file, different fix. |
| F-033 | `POST /api/orders/split-bill` no tenant_id check | **No.** Same. |
| F-066 | IDOR transfer-table (Phase-3 dup of F-031) | **No.** Duplicate of F-031 — same fix closes both. |
| F-067 | IDOR merge-tables (Phase-3 dup of F-032) | **No.** Same. |
| F-068 | IDOR split-bill (Phase-3 dup of F-033) | **No.** Same. |
| F-069 | Loyalty config x-tenant-id header trust | **The subject of this investigation.** Standalone fix. |

The 6 other findings collapse to 3 unique fixes (F-031↔F-066, F-032↔F-067, F-033↔F-068). They are all in `server/routers/orders.ts` lines 1265-1335. Q-019 / Q-025 in OPEN-QUESTIONS.md ask whether those endpoints are reachable from the frontend — the OQ-row notes `parseInt` on UUIDs would produce NaN. That question must be answered (or simply tested) before a Phase 2 fix is designed for that group, because the fix shape depends on whether the endpoints have legitimate callers.

**The F-069 fix has no shared code with the orders.ts IDOR cluster and can be developed, reviewed, merged, and deployed independently.**

A useful Phase 1 product-level claim from this investigation: **the entire `req.headers["x-tenant-id"]` anti-pattern has zero other instances in the codebase** (§3.2). Closing F-069 closes the bug class entirely. There is no follow-up "F-069-FU" to track for header-trust elsewhere.

---

## 8. Open questions

These could not be answered from static reads alone. None block the Phase 2 fix; flag for production recon or stakeholder input as time permits.

| ID | Question | Why it matters | How to resolve |
|----|----------|----------------|----------------|
| F-069-Q1 | Does ANY tenant have rows in `loyalty_tier_config`, `loyalty_tier_log`? | Answers "is this feature ever used?" If zero rows in production, severity for the data exfiltration paths drops (no real data to exfiltrate); the wipe risk on endpoint #2 still stands but only affects future configurations. | Read-only TablePlus query: `SELECT COUNT(*), MIN(created_at), MAX(created_at) FROM loyalty_tier_config; SELECT COUNT(*) FROM loyalty_tier_log;` — write a recon SQL into `audit/` per CLAUDE.md Hard Rule #1. |
| F-069-Q2 | Is there a planned UI for loyalty tier configuration that would call these endpoints? | If yes, the fix will become visible the moment that UI ships. Helpful to know before the fix lands. | Ask product owner. Search Linear / docs for "loyalty tier" feature. |
| F-069-Q3 | Should the 5 endpoints be **deleted** rather than fixed? | If no client caller exists and no UI is planned, removing the endpoints removes the attack surface entirely (with zero behavior change). The fix scope would become "delete 78 lines" instead of "edit 5 lines." | Stakeholder decision. From a security posture standpoint, deletion is strictly better. From a "we may need this later" standpoint, fixing in place preserves optionality. |
| F-069-Q4 | Should the `if (!tenantId)` check at lines 152, 162, 177, 211, 221 be removed in this fix? | It becomes unreachable defensive code after the fix. Keeping it costs nothing, removing it would be a minor cleanup. | Defer — not part of F-069 fix scope. Track as cleanup if file is touched again. |
| F-069-Q5 | Is there any audit-log write I missed when the fix lands? | Endpoint #3 already writes to `loyalty_tier_log` (line 200), but is there a separate `audit_events` write expected for "tier config changed" or "bulk tier upgrade run"? Other admin-style endpoints in this codebase often call `auditLog(...)`. | grep `auditLog\(` near similar endpoints; if pattern says yes, file as F-069-FU follow-up but not block the F-069 fix itself. |
| F-069-Q6 | Should `requireRole("owner", "manager")` be added on top of `requireAuth`? | Currently a kitchen role can call these endpoints (within their own tenant, post-fix). Loyalty configuration is a business-management activity that probably shouldn't be available to line cooks. | Stakeholder/permissions-design decision. Out of scope for the identity-forgery fix; track as a secondary hardening item. |

---

## Appendix — files read in Phase 1

| File | Lines read | Purpose |
|------|------------|---------|
| `server/routers/customers.ts` | 1–228 (full) | Group A: F-069 site |
| `server/auth.ts` | 1–371 (full) | Group D: canonical tenant resolution + requireAuth + impersonation type |
| `server/admin-routes.ts` | 1–449 (start through impersonation flow) | Group C: impersonation mechanism |
| `server/routers/franchise.ts` | 1–280 (full) | Group C: franchise_owner cross-tenant check |
| `shared/permissions-config.ts` | 1–224 (full) | Group C: franchise_owner role definition |
| `client/src/lib/auth.tsx` | partial via grep | Group B: client-side x-tenant-id check |
| `client/src/lib/queryClient.ts` | partial via grep | Group B: client API helper inspection |

Greps performed:
- `x-tenant-id` (case-insensitive) on `server/` and `client/src/`
- `tenant-id` (case-insensitive) on `server/`
- `headers[.tenant` (case-insensitive) on `server/`
- `req.body.tenantId`, `{ tenantId } = req.body`, `req.query.tenantId`, `req.params.tenantId` on `server/`
- `loyalty-tier` on `client/src/` and `server/`
- `franchise` (case-insensitive) on `server/`

[All file reads marked VERIFIED; the inferred-but-unread items are limited to `server/services/loyalty-tier.ts`, `server/admin-migrations.ts` (loyalty_tier rows), and `server/routers/parking.ts` / `server/routers/orders.ts` references to loyalty_tier — these were not read because they are loyalty-tier *consumers* and have no bearing on the F-069 fix.]

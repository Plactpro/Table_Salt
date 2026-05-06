# F-256 Phase 1 — Static Investigation

**Date:** 2026-05-06
**Branch:** fix/F-256-phase1-investigation off main `c305487`
**Scope:** Read-only static trace of the Settings page persistence path (Currency / Subscription Plan / Time Zone). No production network access. No code edits.

---

## TL;DR

F-256 is **not a single bug**. Static reading of the data-flow proves at least two distinct root causes:

1. **Subscription Plan revert is a WRITE-SIDE bug, fully verified from code.** The save handler omits the `plan` field from the PATCH payload, AND the server's owner-editable allowlist intentionally excludes `plan` (it is Stripe-managed). The dropdown is fundamentally non-functional UI.
2. **Currency revert and Time Zone "resets to browser" are NOT obvious from static reading.** The persistence paths look correct: handlers send the right fields, the server allowlist permits them, the schema columns exist, the storage layer is symmetric. Either the render side has a subtle bug not visible from a single-pass static read, or the tester report is describing a different scenario than what the code suggests. **Phase 2 production recon needed.**

Recommendation: **mixed Phase 2** — proceed with a code-only fix for Subscription Plan (it is fully diagnosed), and run production recon for Currency and Time Zone before committing to a fix.

---

## Files in scope

Client:
- `client/src/pages/modules/settings.tsx` — primary Settings page (general tab). Renders all three dropdowns.
- `client/src/pages/modules/settings-hub.tsx` — tab wrapper that mounts `SettingsPage` under tab `general`.
- `client/src/pages/modules/subscription-settings.tsx` — separate Subscription tab; legitimate plan-change UI via Stripe.
- `client/src/lib/auth.tsx` — auth context; provides `useAuth().tenant` consumed by `SubscriptionPlanCard`.
- `client/src/lib/queryClient.ts` — TanStack Query default config; default `queryFn` derives URL from `queryKey.join("/")`.

Server:
- `server/routers/tenant.ts` — GET and PATCH `/api/tenant`.
- `server/lib/tenant-fields.ts` — `OWNER_EDITABLE_FIELDS` allowlist.
- `server/storage.ts` — `getTenant` / `updateTenant`.
- `server/routers/auth.ts` — GET `/api/auth/me` (returns nested `tenant`).

Schema:
- `shared/schema.ts` — `tenants` table.

---

## Data flow traced

### 1. Settings page mount

`client/src/pages/modules/settings.tsx:224-226`:
```ts
const { data: tenant, isLoading } = useQuery<TenantData>({
  queryKey: ["/api/tenant"],
});
```

No explicit `queryFn`. Default `queryFn` in `client/src/lib/queryClient.ts:115-175` builds URL via `queryKey.join("/")` → `"/api/tenant"`. So this fires `GET /api/tenant` on mount.

Local state initial values (`settings.tsx:249-260`):
```ts
const [currency, setCurrency] = useState("USD");
const [currencyPosition, setCurrencyPosition] = useState("before");
const [currencyDecimals, setCurrencyDecimals] = useState(2);
const [timezone, setTimezone] = useState("UTC");
const [timeFormat, setTimeFormat] = useState("12hr");
…
const [plan, setPlan] = useState<SubscriptionTier>("basic");
```

After tenant fetch, `settings.tsx:297-319`:
```ts
useEffect(() => {
  if (tenant) {
    …
    setCurrency(tenant.currency || "USD");
    setCurrencyPosition(tenant.currencyPosition || "before");
    setCurrencyDecimals(tenant.currencyDecimals ?? 2);
    setTimezone((tenant as any).timezone || "UTC");
    setTimeFormat((tenant as any).timeFormat || "12hr");
    …
    setPlan((tenant.plan as SubscriptionTier) || "basic");
    …
  }
}, [tenant]);
```

### 2. Settings page save

The Settings page registers ONE generic mutation that PATCHes `/api/tenant`:

`settings.tsx:338-369`:
```ts
const updateMutation = useMutation({
  mutationFn: async (data: any) => {
    const res = await apiRequest("PATCH", "/api/tenant", data);
    return res.json();
  },
  onSuccess: (_data, variables) => {
    queryClient.invalidateQueries({ queryKey: ["/api/tenant"] });
    queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    …
  },
  …
});
```

Three relevant section handlers, each with its own form:

- `handleTimezoneSubmit` (`settings.tsx:379-382`) → `updateMutation.mutate({ timezone, timeFormat })`
- `handleCurrencySubmit` (`settings.tsx:389-392`) → `updateMutation.mutate({ currency, currencyPosition, currencyDecimals })`
- `handleBusinessConfigSubmit` (`settings.tsx:404-407`) → `updateMutation.mutate({ businessType })` ← **does not include `plan`**

The Business Config form contains BOTH a Business Type dropdown AND a Subscription Plan dropdown wrapped in a single `<form onSubmit={handleBusinessConfigSubmit}>` (`settings.tsx:549-601`). Plan dropdown rendered at `settings.tsx:574-587`. Single Save button at `settings.tsx:598-600` with i18n key `saveBusinessConfig`.

### 3. Server endpoints

`server/routers/tenant.ts:16-26` — GET:
```ts
app.get("/api/tenant", requireAuth, async (req, res) => {
  const user = req.user as any;
  const tenant = await storage.getTenant(user.tenantId);
  const safe = sanitizeTenant(tenant) as any;
  if (tenant) {
    safe.currency = (tenant as any).currency ?? "USD";
    safe.currencyPosition = (tenant as any).currencyPosition ?? "before";
    safe.currencyDecimals = (tenant as any).currencyDecimals ?? 2;
  }
  res.json(safe);
});
```

`server/routers/tenant.ts:28-37` — PATCH:
```ts
app.patch("/api/tenant", requireRole("owner"), async (req, res) => {
  const user = req.user as any;
  const before = await storage.getTenant(user.tenantId);
  // F-023 fix: filter request body through allowlist — system-managed
  // fields (plan, subscriptionStatus, stripe*, trialEndsAt) are blocked.
  const updateData = filterOwnerEditable(req.body);
  const tenant = await storage.updateTenant(user.tenantId, updateData as any);
  …
  res.json(sanitizeTenant(tenant));
});
```

`server/lib/tenant-fields.ts:13-33` — allowlist:
```ts
export const OWNER_EDITABLE_FIELDS = new Set([
  "name", "address",
  "timezone", "timeFormat",
  "taxRate", "taxType", "compoundTax", "serviceCharge",
  "gstin", "cgstRate", "sgstRate", "invoicePrefix",
  "currency", "currencyPosition", "currencyDecimals",
  "businessType",
  "razorpayEnabled", "razorpayKeyId", "razorpayKeySecret",
]);
```

**`plan`, `subscriptionStatus`, `stripeCustomerId`, `stripeSubscriptionId`, `trialEndsAt` are intentionally absent.** The header comment at `server/lib/tenant-fields.ts:1-12` documents this as an F-023 security fix — these fields are only set by Stripe webhooks (`server/routers/billing.ts`) or super-admin routes (`server/admin-routes.ts`).

### 4. Schema and storage

`shared/schema.ts:82-102`:
```ts
export const tenants = pgTable("tenants", {
  id: …,
  name: …,
  …
  timezone: text("timezone").default("UTC"),                      // line 90
  timeFormat: text("time_format").default("12hr"),                // line 91
  currency: text("currency").default("USD"),                      // line 92
  currencyPosition: text("currency_position").default("before"),  // line 93
  currencyDecimals: integer("currency_decimals").default(2),      // line 94
  …
  plan: text("plan").default("basic"),                            // line 101
  businessType: text("business_type").default("casual_dining"),   // line 102
  …
});
```

Drizzle `field: column("snake_case")` mapping is well-defined for every relevant field. `tenants.timezone` Drizzle field name and DB column name are both literally `timezone`.

`server/storage.ts:891-920`:
```ts
async getTenant(id: string) {
  const [t] = await db.select().from(tenants).where(eq(tenants.id, id));
  return t;
}
…
async updateTenant(id: string, data: Partial<InsertTenant>) {
  const [t] = await db.update(tenants).set(data).where(eq(tenants.id, id)).returning();
  return t;
}
```

Symmetric. Drizzle handles snake_case ↔ camelCase via the schema definition.

### 5. Auth-context tenant (separate query)

`client/src/lib/auth.tsx:101-144` runs a SECOND `/api/tenant` query with key `["/api/tenant", user?.tenantId]` and a custom `queryFn` that **normalizes empty fields with defaults**:
```ts
currency: data.currency || "USD",
timezone: data.timezone || "UTC",
…
plan: ((data.plan || "basic").toLowerCase()) as SubscriptionTier,
```

This is consumed by `useAuth().tenant`, which `SubscriptionPlanCard` (`settings.tsx:52-176`) reads. The Settings-page dropdowns do NOT read from this — only from their own `useQuery`.

When the Settings page mutation invalidates `["/api/tenant"]`, TanStack Query's prefix-match invalidation also matches `["/api/tenant", user?.tenantId]`, so both queries refetch.

---

## Per-setting analysis

### Subscription Plan — **WRITE-SIDE bug, fully verified** [VERIFIED]

**Root cause (two layers, either alone is sufficient to break the feature):**

1. The Save handler `handleBusinessConfigSubmit` (`settings.tsx:404-407`) sends only `{ businessType }`. The `plan` local state is never included in the mutation payload. The user sees a toast because `PATCH /api/tenant` succeeds for `businessType`, but `plan` was never even attempted.
2. Even if the handler were patched to send `plan`, the server `filterOwnerEditable` (`server/lib/tenant-fields.ts:39-47`) would silently strip it because `plan` is not in `OWNER_EDITABLE_FIELDS`. This is intentional (F-023 fix).

**Read-back behavior:** after refetch, `tenant.plan` is unchanged. `useEffect` at `settings.tsx:297-319` line 311 fires `setPlan((tenant.plan as SubscriptionTier) || "basic")`, resetting the dropdown to the persisted value. The user sees the dropdown revert.

**Confidence:** HIGH — both layers are directly verifiable from code, and the comment at `server/lib/tenant-fields.ts:1-12` confirms `plan` is deliberately excluded.

**Bug shape:** WRITE-SIDE (handler) + by-design block (allowlist). The legitimate plan-change UI is `subscription-settings.tsx`, which uses `POST /api/billing/create-checkout-session` (line 98) and goes through Stripe.

**Phase 2 candidate (do not apply now):** remove the Plan `<Select>` and Plan label from the Business Config card (`settings.tsx:573-597`). Update `i18n` key `subscriptionPlan` references. The plan display already exists in two valid places: `SubscriptionPlanCard` (`settings.tsx:52-176`) at the top of the same page, and `subscription-settings.tsx` on its own tab.

### Currency — **persistence path looks correct from static reading** [HYPOTHESIS]

**What the code says works:**

- Save handler sends all three fields (`settings.tsx:391`).
- All three are in `OWNER_EDITABLE_FIELDS` (`server/lib/tenant-fields.ts:26-28`).
- GET endpoint enriches with defaults via `??` (`server/routers/tenant.ts:21-23`).
- Schema columns exist (`shared/schema.ts:92-94`).
- Storage `updateTenant` uses `db.update(tenants).set(data)…` — symmetric with `getTenant`.
- Mutation `onSuccess` invalidates `["/api/tenant"]` and `["/api/auth/me"]` (`settings.tsx:344-345`).
- `useEffect` after refetch fires `setCurrency(tenant.currency || "USD")` (`settings.tsx:301`).

**What the tester reports** (F-256 + F-258): "after saving KRW and refreshing, (a) the Currency dropdown is blank, (b) the Preview card shows '$ 1234.56' defaulting to dollar, (c) the rest of the system continues using KRW."

**Critical observation:** "rest of the system continues using KRW" means `tenant.currency` IS persisted as KRW server-side and is read correctly by other surfaces. So the bug is NOT in write or in the storage layer — it is in how the **Settings page itself renders state on mount**.

**Render trace for KRW:** if local `currency === "KRW"`, then `<SelectValue>` children at `settings.tsx:883-887`:
```tsx
<SelectValue>
  {currencyMap[currency as CurrencyCode]
    ? `${currencyMap[currency as CurrencyCode].symbol} ${currencyMap[currency as CurrencyCode].name} (${currency})`
    : currency}
</SelectValue>
```
KRW is in `currencyMap` (`shared/currency.ts:31`), so this should render `"₩ South Korean Won (KRW)"` — not blank. For the trigger to be blank, `currency` state must be `""` or `undefined`. Neither is producible by the visible code path: `useState("USD")` initial → `setCurrency(tenant.currency || "USD")` always falls back to "USD".

**Hypotheses ranked by confidence (none verified):**

1. **H1 — Initial-render race.** During mount, `tenant` is `undefined` while the GET is in flight. The Select renders with `currency === "USD"` for that frame, then re-renders to KRW after `useEffect` fires. If the tester's screenshot was captured during the in-flight frame, it would show USD (not blank). Does not explain "blank."
2. **H2 — Stale cached response.** TanStack Query default `staleTime: Infinity` (`queryClient.ts:202`) means once the cache holds a value, it is never refetched on remount unless explicitly invalidated. If the user navigated away and came back without invalidation, they'd see stale state. Does not explain "blank" either, but explains stickiness.
3. **H3 — Tester report imprecision.** The "blank" may actually be "default USD" that the tester read as blank. The Preview showing "$ 1234.56" is consistent with `currency === "USD"`. Plausible.
4. **H4 — Cache hydration order.** Auth context's normalizing query (`auth.tsx:101-144`) and Settings page's raw query share the same cache prefix. The two queryFns produce different shapes (auth normalizes, settings does not). If a write to one cache slot bleeds into the other (it shouldn't with TanStack Query, but worth confirming), the Settings page state could end up with `currency: undefined`. Low confidence — needs verification.

**Bug shape:** undetermined from static reading. Likely INITIAL-STATE or render-race, NOT read-side or write-side.

**Phase 2 candidates (do not apply now):**
- Production recon: open the page with DevTools, save KRW, refresh, capture (a) the actual `GET /api/tenant` response body, (b) the React state at first paint, (c) the React state after `useEffect` fires.
- If H3 is the cause, the fix is documentation, not code.
- If H1/H2/H4 is the cause, fix may be: remove `useState("USD")` initial and gate render on `isLoading`, OR change `staleTime` for this query, OR consolidate to a single shared `/api/tenant` query.

### Time Zone — **persistence path looks correct from static reading** [HYPOTHESIS]

**What the code says works:**

- Save handler sends timezone+timeFormat (`settings.tsx:381`).
- `timezone` and `timeFormat` are in the allowlist (`server/lib/tenant-fields.ts:16-17`).
- Schema column `tenants.timezone text default 'UTC'` (`shared/schema.ts:90`).
- Storage layer is symmetric.
- Mount-time logic: `setTimezone((tenant as any).timezone || "UTC")` at `settings.tsx:304`.

**No automatic browser-TZ population on mount.** A grep across `client/src` finds only one place that writes browser TZ to settings state:

`settings.tsx:746-757`:
```tsx
<Button
  type="button"
  variant="outline"
  data-testid="button-reset-timezone-browser"
  onClick={() => {
    const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    setTimezone(browserTz);
  }}
>
  <RotateCcw className="h-4 w-4 mr-2" /> {t("resetToBrowser")}
</Button>
```

This is a "Reset to Browser" button positioned **next to** the Save Time Zone button (`settings.tsx:743-756`, both inside the same `<div className="flex gap-2">`). It only writes state on click. There is no mount-time browser-TZ injection.

**What the tester reports:** "Time Zone goes further and resets to browser timezone every refresh."

**Hypotheses ranked by confidence (none verified):**

1. **H1 — Tester confused the buttons.** The Save Time Zone button and Reset to Browser button are adjacent. If the tester clicked Reset and then clicked Save, the saved value would BE the browser TZ. Subsequent refreshes would correctly show browser TZ. From a tester's perspective this looks like "it keeps resetting." MEDIUM-HIGH confidence — buttons are visually adjacent and the i18n labels (`saveTimezone` vs `resetToBrowser`) may be ambiguous in some translations.
2. **H2 — `tenant.timezone` is being saved as null/empty by some other code path.** If e.g. a registration flow or default seeding writes `timezone: null` after the user saves, the GET would return null, and `(tenant as any).timezone || "UTC"` falls through to `"UTC"`. But the tester reports BROWSER TZ, not UTC. Does not match.
3. **H3 — Reset button auto-fires on some condition.** No `useEffect` calls `setTimezone(browserTz)`. Static reading rules this out.
4. **H4 — Tester is in a TZ that happens to match `"UTC"` (e.g., London in winter).** If `tenant.timezone` is being saved as `null`, `setTimezone("UTC")` runs, and the user happens to be in UTC, they would interpret the dropdown as "browser TZ." Possible but specific.

**Bug shape:** undetermined from static reading. **No code path that auto-populates browser TZ on mount exists.** Either H1 (tester confusion) or a server-side persistence issue we cannot see from the client.

**Phase 2 candidates (do not apply now):**
- Production DB read via TablePlus: `SELECT id, name, timezone, time_format FROM tenants WHERE id = '<test-tenant-id>';` after a tester save. If `timezone` is `null` or different from what the tester selected, it is a persistence bug. If it matches, it is H1.
- If H1, the fix is UX: visually separate Save vs Reset, OR remove the Reset button entirely (it is dangerous adjacent to Save).

---

## Single root cause vs three separate?

**Three separate bugs.** The backlog hypothesis "single bug in the read-back path" is contradicted by the static evidence:

- Subscription Plan: WRITE-SIDE (handler omits the field, allowlist blocks it).
- Currency: persistence path looks correct; render-side or stale-cache issue suspected, NOT a read-back bug.
- Time Zone: persistence path looks correct; no code path auto-populates browser TZ; tester report may describe button confusion.

These three do NOT share a root cause from the static evidence available.

---

## Phase 2 recommendation

**Mixed approach:**

1. **Subscription Plan: code-only fix.** Remove the plan dropdown from `settings.tsx:573-597`. Plan changes belong in `subscription-settings.tsx` (Stripe path). Single-file change, ~25 lines removed plus 1 i18n key cleanup. No production recon needed.

2. **Currency and Time Zone: production recon BEFORE any code change.** Specifically:
   - Open Settings page with DevTools network panel open.
   - For Currency: select KRW, save, refresh. Capture the literal JSON of `GET /api/tenant` after refresh and the React state on the dropdown. If `data.currency === "KRW"` but the dropdown is blank → render bug; if `data.currency === null` → write-side bug; if `data.currency === "USD"` → write hit a different field/table.
   - For Time Zone: select a non-browser TZ (e.g., Pacific/Auckland from any other location), save, refresh. Capture the JSON. If `data.timezone === "Pacific/Auckland"` and the dropdown shows it correctly → tester confusion (close as "by design but UX confusing" plus rename Reset button). If `data.timezone === null` or browser TZ → real persistence bug.
   - Optionally TablePlus read-only: `SELECT id, currency, timezone, time_format, plan FROM tenants WHERE id = '<test-tenant-id>';`

3. **F-258 should be merged into F-256.** F-258 describes the same Currency three-state symptom as F-256's currency case. Same investigation covers both.

---

## Open questions

- **Q-F256-1:** Is the tester sometimes clicking "Reset to Browser" instead of "Save Time Zone"? The buttons are visually adjacent at `settings.tsx:742-757`. Need a screen recording or tester confirmation.
- **Q-F256-2:** Does the F-256 backlog entry's "Subscription Plan" claim refer to the dropdown in the Business Config form, or somewhere else? The only plan dropdown on the Settings page is the one at `settings.tsx:574-587`. The Subscription Settings tab uses Stripe upgrade buttons, not a dropdown.
- **Q-F256-3:** Why does the Settings page run its own `["/api/tenant"]` query (`settings.tsx:224-226`) instead of consuming `useAuth().tenant` from the auth context? The duplication is a code smell but does not by itself explain the reverts. Worth a follow-up cleanup ticket regardless.
- **Q-F256-4:** Should `SubscriptionPlanCard` (`settings.tsx:52-176`) and the (broken) Plan dropdown in Business Config show consistent state? They read from different sources (`useAuth()` vs `useQuery`); if the user changes the dropdown locally, the card stays on the persisted value, which may itself look like a "revert" symptom.
- **Q-F256-5:** Are there other settings pages (`settings-hub.tsx` mounts several: `SecuritySettingsPage`, `ShiftsManagement`, `QrRequestSettings`, etc.) where the same pattern could be reproduced? Out of scope for Phase 1.

---

## Phase 2 candidates (do not apply now)

Per CLAUDE.md "If you find what looks like a quick one-line fix during investigation, DO NOT apply it in this phase":

- **F256-Q1** — Remove plan `<Select>` from Business Config form (`client/src/pages/modules/settings.tsx:573-597`). Single-file change. ~25 lines + i18n cleanup. CONFIDENCE: HIGH.
- **F256-Q2** — Rename or remove "Reset to Browser" button at `client/src/pages/modules/settings.tsx:746-757` to reduce confusion with adjacent Save button. CONFIDENCE: medium, depends on Q-F256-1 resolution.
- **F256-Q3** — Consolidate the duplicate `/api/tenant` queries (auth context + Settings page) to a single source of truth. Code smell. Unrelated to F-256 reverts but surfaced during this trace.

---

## Out of scope, surfaced during trace

- **F-023 maintenance reminder.** `server/lib/tenant-fields.ts:10-12` says: "MAINTENANCE: If a new column is added to the tenants table, it must be explicitly added here to be owner-editable. See F-023-FU." The F-023-FU follow-up is already tracked in `audit/00-backlog.md` ("F-023-FU — Tenant-fields allowlist enforcement"). No new finding; just confirms the existing follow-up is still relevant.

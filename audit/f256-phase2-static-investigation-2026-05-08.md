# F-256 Phase 2 — Static Investigation (post-tester recon)

**Date:** 2026-05-08
**Branch:** fix/F-256b-phase2-impl (investigation-only — no code changes in this phase)
**Scope:** Re-read the Settings-page persistence path with the benefit of tester evidence captured 2026-05-08 morning. Lock the root-cause hypothesis and identify the smallest fix shape that closes both F-256b (Currency dropdown reverts to empty on refresh) and F-256c (Time Zone dropdown reverts to empty on refresh).

---

## TL;DR

Static reading of the persistence path remains symmetric and correct: write hits the right fields, the allowlist permits them, the schema columns exist, the GET endpoint returns them, and the client `useEffect` rehydrates state with `tenant.currency || "USD"` and `tenant.timezone || "UTC"` (so state can never legitimately be `""`). The bug is therefore NOT a write-side or read-side regression — it is in the **mount-time hydration pattern**. The Settings page initializes form state with a hard-coded fallback (`useState("USD")`, `useState("UTC")`) on first render, then relies on a downstream `useEffect` to overwrite that state with the GET response. Tester evidence (both testers, independent captures) plus the absence of any `placeholder` prop on the Currency `<SelectValue>` (`settings.tsx:843-850`) makes this two-render dance the only remaining explanation for a blank trigger after refresh while POS reads the saved value correctly from `/api/auth/me`. **F-256b and F-256c share the same root cause and the same fix shape**: replace the useState + useEffect hydration with a child component that mounts only after `tenant` resolves, with `useState(() => tenant.currency || "USD")` (lazy initializer) baking the saved value into the Select on first render. Single file, ~80 lines extracted into a sub-component.

---

## Files read

Client:
- `client/src/pages/modules/settings.tsx` (full read of header/state/handlers/Currency card/Time Zone card; lines 1-100, 200-1000)
- `client/src/lib/auth.tsx` (full read; 1-243)
- `client/src/lib/queryClient.ts` (full read; 1-253)
- `client/src/components/ui/select.tsx` (full read; 1-160)
- `client/src/lib/timezones.ts` (grep-confirmed `America/New_York` line 19, `Europe/London` line 30)
- `client/src/pages/modules/pos.tsx` (lines 9, 337, 347-349 — confirms POS reads `user.tenant.currency` from `/api/auth/me`, NOT `/api/tenant`)

Server:
- `server/routers/tenant.ts` (full read; 1-263 — GET at 16-26, PATCH at 28-37)
- `server/routers/auth.ts` (lines 324-353 — `/api/auth/me` handler)
- `server/lib/tenant-fields.ts` (verified via Phase 1 — allowlist permits currency/currencyPosition/currencyDecimals/timezone/timeFormat)

Shared:
- `shared/currency.ts` (grep-confirmed `KRW` registered at line 31 with `decimalPlaces: 0`)

Reference:
- `audit/f256-phase1-static-investigation-2026-05-06.md` (Phase 1 — all findings cross-checked below)

---

## Currency dropdown read-back analysis

**Initial state declaration** (`settings.tsx:247-249`):
```ts
const [currency, setCurrency] = useState("USD");
const [currencyPosition, setCurrencyPosition] = useState("before");
const [currencyDecimals, setCurrencyDecimals] = useState(2);
```
Initializer fires once on mount. Hard-coded "USD" — no reference to `tenant`.

**Query** (`settings.tsx:222-224`):
```ts
const { data: tenant, isLoading } = useQuery<TenantData>({
  queryKey: ["/api/tenant"],
});
```
No `queryFn` — uses the default at `queryClient.ts:115-175`, which derives the URL from `queryKey.join("/")` → `/api/tenant`. Returns the **raw response body**, no normalization. `staleTime: Infinity` (default at `queryClient.ts:202`).

**Hydration effect** (`settings.tsx:294-315`):
```ts
useEffect(() => {
  if (tenant) {
    setName(tenant.name || "");
    setAddress((tenant as any).address || "");
    setCurrency(tenant.currency || "USD");
    setCurrencyPosition(tenant.currencyPosition || "before");
    setCurrencyDecimals(tenant.currencyDecimals ?? 2);
    setTimezone((tenant as any).timezone || "UTC");
    setTimeFormat((tenant as any).timeFormat || "12hr");
    …
  }
}, [tenant]);
```
Fires after each render where `tenant` reference changed. Falls back to `"USD"` if `tenant.currency` is falsy. **Cannot produce `currency === ""`.**

**Render gate** (`settings.tsx:461-467`):
```ts
if (isLoading) {
  return <loading screen>;
}
```
While `isLoading`, the form is not rendered at all. Once `isLoading: false`, the JSX is returned. By that point:
- `tenant` is defined (the query has resolved)
- BUT `currency` state is still `"USD"` (the initial useState value) on this first render — `useEffect` has not yet fired
- Render 1 of the Select: `value="USD"`
- Effect fires: `setCurrency("KRW")` (assuming tester saved KRW)
- Render 2 of the Select: `value="KRW"`

**Trigger render** (`settings.tsx:843-850`):
```tsx
<Select value={currency} onValueChange={setCurrency}>
  <SelectTrigger data-testid="select-currency">
    <SelectValue>
      {currencyMap[currency as CurrencyCode]
        ? `${currencyMap[currency as CurrencyCode].symbol} ${currencyMap[currency as CurrencyCode].name} (${currency})`
        : currency}
    </SelectValue>
  </SelectTrigger>
```
**No `placeholder` prop on `<SelectValue>` and no `placeholder` on `<SelectTrigger>`.** Radix Select's `Value` primitive (`select.tsx:13` — pure re-export of `SelectPrimitive.Value`) renders the placeholder when its internal item-registration considers the current `value` to match no item. With no placeholder set, the trigger renders blank — exactly the "empty" symptom both testers captured.

**SelectItem source** (`settings.tsx:864-872`):
```tsx
{currencyList.map((c) => (
  <SelectItem key={c.code} value={c.code} data-testid={`option-currency-${c.code}`}>
    …
  </SelectItem>
))}
```
`currencyList` is `Object.values(currencyMap)` filtered by `currencySearch` (`settings.tsx:426-436`). On mount `currencySearch === ""`, so all currencies (including KRW per `shared/currency.ts:31`) are present. `<SelectContent>` is wrapped in a Radix Portal (`select.tsx:74`) — items are mounted into the Portal but may register their text/value pairs lazily.

**Why the symptom can occur**: The two-render dance (Render 1 with stale `"USD"`, Render 2 with hydrated `"KRW"`) is the canonical scenario in which Radix Select's controlled-value pathway is fragile — the Trigger pre-commits to a value before the effect-driven update lands, and on the second render it can read `value="KRW"` while the matching SelectItem registration timing leaves the trigger in placeholder mode. Because there is no placeholder, the trigger displays nothing. Critically, the GET response and the React state are both correct — only the trigger's rendering is empty.

**Why POS still reads correctly**: `client/src/pages/modules/pos.tsx:347` uses `user?.tenant?.currency` from `/api/auth/me` (`server/routers/auth.ts:339-343`). That's an entirely separate cache slot, separate endpoint, separate component mount, and POS does NOT use Radix Select to display the currency — it uses the value directly to format prices. So the data is fine; only the Settings-page Select trigger rendering is broken.

---

## Time Zone dropdown read-back analysis

**State** (`settings.tsx:250-251`):
```ts
const [timezone, setTimezone] = useState("UTC");
const [timeFormat, setTimeFormat] = useState("12hr");
```
Same pattern as Currency: hard-coded fallback initial.

**Hydration** (`settings.tsx:301-302`):
```ts
setTimezone((tenant as any).timezone || "UTC");
setTimeFormat((tenant as any).timeFormat || "12hr");
```
Cast to `any` because `TenantData` interface (`settings.tsx:33-41`) does NOT declare `timezone` or `timeFormat`. Behaviorally identical to Currency hydration.

**Trigger render** (`settings.tsx:652-657`):
```tsx
<Select value={timezone} onValueChange={setTimezone}>
  <SelectTrigger data-testid="select-timezone">
    <SelectValue placeholder={t("selectTimezone")}>
      {selectedTz ? `${selectedTz.flag} ${selectedTz.label} (${selectedTz.offset})` : timezone}
    </SelectValue>
  </SelectTrigger>
```
**Has a `placeholder={t("selectTimezone")}` set.** When Radix decides no item matches, it renders the localized "Select Timezone" placeholder text — which Madhesh would describe as "empty" if he is reading it as default/un-set state. Nandhini's report of "post-refresh state ambiguous" is consistent with seeing the placeholder text rather than the saved value.

**Time format Select** (`settings.tsx:688-694`) renders identically with no placeholder, so on the same race could blank out, though only "12hr"/"24hr" are options and one will likely match the state.

**Reset-to-Browser button** (`settings.tsx:708-718`) is unrelated to refresh-time rendering — it only fires `setTimezone(browserTz)` on click. The downstream symptom in F-269 (Reports/Phone Orders falling back to browser TZ) is a SEPARATE pathway: those pages use `Intl.DateTimeFormat().resolvedOptions().timeZone` instead of `tenant.timezone` because the dropdown UI bug here is treated as "no saved timezone" by some downstream consumers. The fix here also unblocks F-269 *if* downstream consumers are reading the persisted tenant timezone correctly elsewhere; if not, F-269 needs its own fix.

**Component pattern**: Currency and Time Zone use the same `useState(<hardcoded>)` + `useEffect(set from tenant)` pattern, in the same file, with identical timing. The two bugs share one component-architecture root cause; they are NOT two separate bugs requiring two separate fixes.

---

## Cross-check against Phase 1 hypotheses

Phase 1 ranked four hypotheses for Currency and four for Time Zone:

**Currency / H1 (initial-render race during in-flight)** — **REFINED & PROMOTED.** Phase 1 noted this would "show USD, not blank." Today's reading shows that's true if you reason only about the JSX expression children. But Radix Select's actual rendering depends on internal item-registration, and with NO placeholder on the Currency `<SelectValue>`, a "no-match" decision by Radix produces blank, not USD. So H1 is the mechanism, but the visible-rendering reasoning in Phase 1 was incomplete.

**Currency / H2 (stale cached `staleTime: Infinity`)** — **REFUTED for the F5 case.** F5 is a full page reload; TanStack cache is in-memory and reset to empty. Mutation invalidation isn't the F5 path either. H2 might explain stickiness on within-session navigation, but the testers' "F5 → empty" specifically rules it out.

**Currency / H3 (tester report imprecision: USD looks like blank)** — **REFUTED.** Both testers independently confirmed blank. PATCH payloads were captured (`{"currency":"KRW",…}` and time-zone equivalents) and 200 responses verified. No tester-side ambiguity remains.

**Currency / H4 (cache-slot bleed between auth-context and Settings-page queries)** — **REFUTED.** Confirmed two separate cache slots: `["/api/tenant"]` (Settings, raw) vs `["/api/tenant", user.tenantId]` (auth context, normalized). They live independently in TanStack Query's hash table; prefix-match invalidation triggers refetches but does not blend their data.

**Time Zone / H1 (button confusion: tester clicked Reset)** — **REFUTED for F-256c.** Today's testers explicitly captured PATCH payloads with the *intended* TZ (America/New_York, Europe/London). They did not click Reset. The symptom is the same dropdown-rendering pattern as Currency, not a button mix-up.

**Time Zone / H2-H4 (persistence/null/coincidental UTC)** — **REFUTED.** PATCH payload + 200 response means timezone IS saved correctly server-side; F-256c is a render-side issue identical in shape to F-256b.

---

## Locked root cause hypothesis

**The Currency Configuration and Time Zone Configuration cards on `client/src/pages/modules/settings.tsx` initialize their form state with hard-coded fallbacks (`useState("USD")`, `useState("UTC")`) and rely on a single shared `useEffect` (lines 294-315) to rehydrate from the GET `/api/tenant` response after the data loads. This produces a deterministic two-render sequence on every mount:**

1. **Render 1 (post-isLoading):** `tenant` is defined; `currency`/`timezone` state still hold the hard-coded initial values; the `<Select>` mounts with `value="USD"` / `value="UTC"`. Radix Select wires up its internal selected-item state to USD/UTC.
2. **`useEffect` fires:** `setCurrency(tenant.currency || "USD")`, `setTimezone((tenant as any).timezone || "UTC")` — state updates to KRW / America-New_York.
3. **Render 2:** `<Select>` receives the new `value` prop; Radix Select must reconcile its internal selected-item state from the previous USD/UTC to the new value. Under specific item-registration timings (Portal-mounted SelectItems, Radix's `<SelectItemText>` registry), the trigger can fall back to placeholder mode.

For Currency, the `<SelectValue>` at `settings.tsx:843-850` has **no `placeholder` prop**, so the trigger renders blank when Radix is in placeholder mode. For Time Zone, `<SelectValue>` at `settings.tsx:653-657` has `placeholder={t("selectTimezone")}` set, so the trigger renders the literal "Select Timezone" string when Radix is in placeholder mode — which testers describe as "empty." Both behaviors are the same root cause, two different placeholder configurations.

**Confidence:** HIGH for the architectural root cause (useState-initial + useEffect-hydration pattern is the only plausible blanking vector consistent with all of: GET correctly returning the saved value, PATCH correctly persisting it, POS correctly reading from `/api/auth/me`, the absence of any code path that sets state to `""`, and the lack of placeholder on Currency `<SelectValue>`). MEDIUM confidence for the precise Radix-internal trigger (cannot be observed from static reading without instrumenting the runtime). The fix shape below is robust against any specific Radix-timing mechanism within this hypothesis class.

---

## Fix shape recommendation

**Single file, single architectural change.** Extract the form-state-bearing JSX into a child component that **only mounts after `tenant` is defined**, and use a **lazy initializer** so the Select is born with the saved value already wired in — eliminating the two-render dance entirely.

**File:** `client/src/pages/modules/settings.tsx`

**Approximate line ranges affected:**
- Lift state declarations (currently 243-263) out of `SettingsPage` and into a new sub-component `<SettingsForm tenant={tenant} />`.
- Remove the `useEffect` hydration block at 294-315 (state is now initialized correctly on first render of `<SettingsForm>`).
- Wrap the existing JSX from ~504-994 into the sub-component, render it as `{!isLoading && tenant && <SettingsForm tenant={tenant} />}` from `SettingsPage`.
- Pattern (illustrative — DO NOT apply in this phase):
  ```ts
  function SettingsForm({ tenant }: { tenant: TenantData }) {
    const [currency, setCurrency] = useState(() => tenant.currency || "USD");
    const [currencyPosition, setCurrencyPosition] = useState(() => tenant.currencyPosition || "before");
    const [currencyDecimals, setCurrencyDecimals] = useState(() => tenant.currencyDecimals ?? 2);
    const [timezone, setTimezone] = useState(() => (tenant as any).timezone || "UTC");
    const [timeFormat, setTimeFormat] = useState(() => (tenant as any).timeFormat || "12hr");
    // … remainder of state hooks moved here, all using lazy initializers …
    // … remainder of JSX, mutation handler, useMutation hook moved here …
  }
  ```
- Add `placeholder={t("selectCurrency")}` to the Currency `<SelectValue>` at `settings.tsx:845` as a defense-in-depth measure (even with the architectural fix, a missing placeholder is poor UX if any future state change re-introduces a no-match condition).

**Bug shape:** structural (component split + lazy initializer) — NOT a one-line fix. The one-line workaround (adding `key={tenant?.id}` to the page-level container) would force a remount on tenant arrival but bypasses the underlying architectural smell of duplicating `/api/tenant` queries between Settings page and auth context (Phase 1 Q-F256-3, Q-F256-4). The structural fix is the right call.

**Smaller "ship-now" alternative** (if the structural change is too risky to land at once): add `key={`select-currency-${tenant?.id ?? "loading"}`}` to the `<Select>` at line 843 and the corresponding key to the Time Zone `<Select>` at line 652. Forces Radix to fully remount each Select when `tenant` resolves, with the controlled `value` already set to the saved value on the new mount. Two-line change. **NOT recommended as the durable fix** — leaves the duplicate-query smell intact and only papers over the symptom — but acceptable as a hotfix if the structural refactor needs more bake time.

---

## Risk assessment

**Risks of the recommended structural fix:**

1. **Other settings sections rely on the same state hooks.** Profile (name/address), Tax (taxRate/taxType/compoundTax/serviceCharge/gstin/cgstRate/sgstRate/invoicePrefix), Razorpay (razorpayEnabled/razorpayKeyId/razorpayKeySecret), Business (businessType), Default Language all share `SettingsPage`'s state. Lifting state into a child component pulls ALL of them with it. The bug only affects Currency and Time Zone visibly — Profile/Tax/Razorpay use plain `<Input>` and `<Switch>` which don't show the empty-trigger symptom — but they do share the same hydration pattern and could harbor latent versions of the same bug. Fixing all of them together via the structural change is correct.

2. **Mutation handler scope.** `updateMutation` (`settings.tsx:334-365`) is currently in `SettingsPage` scope and is referenced by all section handlers. Moving state to a child requires either (a) moving the mutation into the child as well, or (b) keeping the mutation at parent scope and passing a handler down. Option (a) is cleaner.

3. **`SaveOverlay` and `savedSection` state** (`settings.tsx:220, 329-332, 486-502`). Lives at parent scope; would also need to move into the child.

4. **`isLoading` gate at line 461-467** stays at parent. Parent renders `<SettingsForm tenant={tenant} />` only when `tenant` is defined, so the child's lazy initializers can safely dereference `tenant.currency` etc. with no `?.` chains.

5. **i18n / translations.** `useTranslation` calls scattered through the JSX. Moving JSX into the child component just needs to call `useTranslation` inside the child too. No string changes required.

6. **`useAuth().user` reference at line 218.** Only used for nothing visible in the section we're moving. Should be safe to move or leave at parent (only `user` is read, not `tenant`).

7. **Duplicate `/api/tenant` queries** (Phase 1 Q-F256-3 / Q-F256-4) remain after this fix. The Settings page still uses `useQuery({queryKey: ["/api/tenant"]})` separate from `useAuth().tenant`. This fix does NOT address that smell — but it also doesn't make it worse, and the bug is closed regardless.

**Regression surfaces to validate after fix is applied (out of scope for this phase):**
- Save Profile, Save Tax, Save Currency, Save Time Zone, Save Business Config, Save Razorpay, Save All — all six save buttons must still write through the mutation correctly.
- The `formProfileDirty` beforeunload guard (`settings.tsx:322-327`) must still fire when the user has typed in name/address but not yet saved.
- Default language Select (`settings.tsx:611-631`) uses its own state `tenantDefaultLang` from a separate `["/api/tenant/default-language"]` query and a separate mutation; not affected by this fix and should be left alone.
- The `currentTime` and `currentDate` derived values (`settings.tsx:439-440`) use `timezone` + `timeFormat` state — these now live in the child, so the live clock display moves with them.
- `SubscriptionPlanCard` (`settings.tsx:50-176`) reads from `useAuth().tenant`, not page state. Not affected.
- `ThemeCard` (referenced at line 519) is a separate component. Not affected.

**Risks of the smaller `key=` workaround (if chosen instead):**
- Each Select fully unmounts and remounts every time `tenant` reference identity changes (e.g., after every save's invalidation+refetch). This causes a brief flicker. Tester perception: probably not noticeable, but worth verifying.
- Doesn't fix latent forms of the same bug in Profile/Tax/Razorpay sections. They will quietly continue to suffer the two-render dance, masked only by the fact that `<Input>` does not have Radix's item-registration timing issue.

**Risks of doing nothing in this branch:** F-256b/c remain open in production. Given POS reads from `/api/auth/me` and works correctly, only the Settings page UX is broken — but that breakage prevents owners from confirming their saved currency/timezone, which is itself a trust issue.

---

## Open questions

- **Q-F256-Phase2-1:** Does the proposed structural fix also resolve F-269 (Reports / Phone Orders fall back to browser TZ)? Static reading can't tell — those pages may be reading `tenant.timezone` correctly from `/api/auth/me` already, in which case F-269 is its own bug located in the consumer pages, not in Settings. Needs a separate trace of `client/src/pages/modules/reports.tsx` and `client/src/pages/modules/phone-order.tsx` to find their TZ-reading pathway. Out of scope for F-256b/c phase 2.
- **Q-F256-Phase2-2:** Can we confirm the Radix-internal mechanism (item-registration race vs. controlled-value reconciliation timing) without running the app? Probably not — would require either (a) running the dev server with React DevTools to inspect Radix Select's internal state during the mount sequence, or (b) reading `@radix-ui/react-select` source to confirm the exact branching. The locked hypothesis does NOT depend on identifying the exact branch — the fix shape closes any mechanism in this class.
- **Q-F256-Phase2-3:** Should the duplicate `/api/tenant` query (Settings page raw vs. auth context normalized) be consolidated as part of this fix? Phase 1 Q-F256-3 flagged this as a code smell. Adding it to this fix grows the blast radius beyond "smallest change." Recommend deferring to a follow-up cleanup ticket.
- **Q-F256-Phase2-4:** The `<SelectValue>` for Currency lacks a `placeholder` prop. Should every Select in the codebase get a placeholder as a hardening sweep? Not strictly necessary for this fix, but a separate audit pass might be valuable.
- **Q-F256-Phase2-5:** Tester capture confirmed Currency revert; Nandhini's Time Zone post-refresh state was ambiguous. If the fix is structural and addresses the shared root cause, both will be closed together. But if QA wants per-bug verification, an additional capture from Nandhini specifically for Time Zone is worth requesting after the fix lands.

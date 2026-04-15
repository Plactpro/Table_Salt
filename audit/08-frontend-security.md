# Phase 8: Frontend Security Audit

Scope: `client/src/`, `client/index.html`, `client/public/`
Date: 2026-04-15

---

## 1. XSS Vectors

### 1.1 `dangerouslySetInnerHTML` (1 use)

**File:** `client/src/components/ui/chart.tsx:79`
**Content rendered:** CSS theme variables generated from a `ChartConfig` object. The config values are color strings and theme identifiers.
**Exploitability:** [VERIFIED] **Low / Info.** The HTML injected into a `<style>` tag is derived from the `THEMES` constant and the `ChartConfig` object which contains color values (e.g., `hsl(...)` or hex). These are developer-supplied config objects, not user input. An attacker would need to control the chart configuration to inject CSS (style injection). No path exists for end-user data to reach this template.

### 1.2 `innerHTML` (1 use)

**File:** `client/src/pages/modules/menu.tsx:915`
**Content rendered:** Static SVG fallback icon when an `<img>` fails to load. The entire string is a hardcoded SVG literal:
```
(e.target as HTMLImageElement).parentElement!.innerHTML = '<div class="w-full h-full flex items-center justify-center"><svg ...></svg></div>';
```
**Exploitability:** [VERIFIED] **Not exploitable.** The string is a compile-time constant with zero interpolation of user data.

### 1.3 `document.write` (4 uses)

All four uses write HTML into a newly opened `window.open("", "_blank")` popup for print purposes. The popup is a separate origin context (`about:blank`), and the main application DOM is not affected.

#### 1.3.1 Print utility
**File:** `client/src/lib/print-utils.ts:726`
**Content:** HTML built by `buildReceiptHtml()` and `buildKotHtml()` (lines 270-620).
**XSS protection:** [VERIFIED] **Well-protected.** A dedicated `esc()` function (lines 4-12) performs full HTML entity encoding (`&`, `<`, `>`, `"`, `'`). Grep confirms 34 call sites — every user-derived field (restaurant name, item names, notes, customer names, GSTIN, waiter name, etc.) passes through `esc()` before interpolation.

#### 1.3.2 Bill preview receipt
**File:** `client/src/components/pos/BillPreviewModal.tsx:2105`
**Content:** `data.html` received from `POST /api/print/receipt/:billId`. This is server-generated HTML.
**Exploitability:** [VERIFIED] **Medium risk.** The HTML is trusted from the server API response. If the server includes unsanitized user data in its HTML response, this becomes an XSS vector. The client performs **zero sanitization** on `data.html` before writing it. However, the popup targets `about:blank` and the main app session is not directly accessible from the popup.
**Severity:** Medium (stored XSS requires server-side vulnerability as precondition).

#### 1.3.3 POS shift report
**File:** `client/src/components/pos/PosSessionModal.tsx:150-171`
**Content:** Shift report with payment method breakdown.
**Exploitability:** [VERIFIED] **Medium risk.** Line 150 interpolates payment method names (`${m}`) from `source.revenueByMethod` keys directly into `<tr><td>${m}</td>...` with **no HTML escaping**. If a payment method name in the database contains HTML/script tags (e.g., a malicious admin creates a method named `<img src=x onerror=alert(1)>`), this is exploitable as stored XSS. Realistic attack surface is limited to users who can configure payment methods.
**Severity:** Medium.

#### 1.3.4 Parking ticket
**File:** `client/src/pages/modules/parking.tsx:275-324`
**Content:** Parking ticket with vehicle details.
**Exploitability:** [VERIFIED] **Medium risk.** Multiple fields interpolated without escaping:
- Line 292: `${createdTicket.ticketNumber}` (server-generated, low risk)
- Line 295: `${createdTicket.vehicleNumber}` (user input, **no escaping**)
- Line 296: `${createdTicket.vehicleType}` (enum, low risk)
- Line 297: `${createdTicket.vehicleColor}` (user input, **no escaping**)
- Line 298: `${createdTicket.slotCode}` (server-generated, lower risk)
- Line 299: `${createdTicket.keyTagNumber}` (user input, **no escaping**)
- Line 300: `${createdTicket.customerName}` (user input, **no escaping**)
- Line 307-312: Condition report fields (user input, **no escaping**)
- Line 312: `${createdTicket.conditionReport.notes}` (free-text user input, **no escaping**)

An attacker entering `<script>alert(1)</script>` as a vehicle number would get script execution in the print popup. Impact is limited because the popup is `about:blank` and cannot access the main app's cookies (HttpOnly) or session storage directly, but it can still phish users or redirect them.
**Severity:** Medium.

### 1.4 No `eval()`, `new Function()`, or `srcdoc=` usage
[VERIFIED] Zero matches across all `client/src/` files.

---

## 2. Secrets in Frontend Bundle

### 2.1 Environment Variables
**File:** `client/src/components/GlobalErrorBoundary.tsx:27,31,56`
Only three references to `import.meta.env`: `import.meta.env.DEV` and `import.meta.env.PROD` (Vite built-in booleans). No custom `VITE_*` variables are read anywhere in the client source.

**Zero `process.env` references** in `client/src/`.

### 2.2 Hardcoded Secrets
[VERIFIED] **None found.** No hardcoded API keys, tokens, passwords, JWT secrets, or encryption keys exist in `client/src/`.

- Stripe publishable keys: Only placeholder strings (`pk_live_...`, `sk_live_...`) appear in input placeholders. No actual key values.
- Razorpay key IDs: Only placeholder strings (`rzp_live_xxxxxxxxxxxx`) in i18n JSON. No actual key values.
- VAPID public key: Fetched at runtime from `/api/push/vapid-public-key` (`client/src/hooks/use-push-notifications.ts:24`). Not embedded.
- Stripe/Razorpay: `loadStripe` is not used client-side. Payment processing goes through server-side endpoints.

### 2.3 Payment Secret Handling in Settings UI
**File:** `client/src/pages/admin/settings.tsx:66-70,302-360`
**File:** `client/src/pages/modules/settings.tsx:266,397-401`
[VERIFIED] **Correct pattern.** Secret keys (Stripe sk_, Razorpay secret) are entered via password-type inputs, sent to server, and the server returns only a boolean `stripeKeySecretConfigured` / `razorpayKeySecretConfigured` flag. Secrets are never returned from the API or displayed after saving.

### 2.4 TOTP Secret Display
**File:** `client/src/pages/modules/security-settings.tsx:1157-1158`
[VERIFIED] **Expected behavior.** The TOTP secret is displayed once during 2FA setup (QR code + manual entry code). This is the standard TOTP enrollment flow — the secret must be shown to the user exactly once.

### 2.5 `client/index.html` and `client/public/`
[VERIFIED] **Clean.** `index.html` contains only standard meta tags, font links, manifest reference, and service worker registration. No secrets, tokens, or API keys. The `manifest.json` and `offline.html` are benign. No `.env` files exist under `client/`.

---

## 3. Error Handling / Information Leakage

### 3.1 `throwIfResNotOk` Error Propagation
**File:** `client/src/lib/queryClient.ts:8-21`

The function extracts the `message` field from JSON error responses or falls back to raw response text:
```typescript
throw new Error(`${res.status}: ${(body as { message?: string })?.message ?? res.statusText}`);
```
The resulting `Error.message` format is `"<status>: <server message>"`.

### 3.2 Error Display to Users
[VERIFIED] **Widespread raw error display.** Across the entire codebase, `e.message` is shown directly in toast notifications. Examples:
- `client/src/pages/menu/menu-pricing.tsx:218,227,238,1023,1039,1135,1269` (7 locations)
- `client/src/pages/modules/audits.tsx:267,280,292,307,324,333,342` (7 locations)
- `client/src/pages/admin/admins.tsx:93,107`
- `client/src/pages/admin/breach-incidents.tsx:119,436,651`
- `client/src/pages/admin/settings.tsx:103,119`
- `client/src/pages/admin/tenant-detail.tsx:163,176,190,204,218`
- `client/src/pages/admin/tenants.tsx:160,172,187`
- `client/src/pages/admin/users.tsx:155,168,183`
- `client/src/pages/admin/vendor-risks.tsx:120,262`
- `client/src/pages/onboarding.tsx:672,689,706`
- `client/src/pages/recycle-bin.tsx:176,189`
- `client/src/pages/tips/report.tsx:79`
- And more across modules...

**Risk:** If the server ever returns a raw error message containing SQL details, stack traces, or internal paths, these will be displayed verbatim to the user. The error messages depend entirely on server-side error formatting discipline. The client performs **zero sanitization or generic mapping** of error messages before display.

**Severity:** Medium (information leakage depends on server error hygiene, but the client has zero defense-in-depth).

### 3.3 GlobalErrorBoundary
**File:** `client/src/components/GlobalErrorBoundary.tsx:26-76`

[VERIFIED] **Well-implemented with one concern:**
- In **production** (`import.meta.env.PROD`), the error boundary shows a generic "Something went wrong" message (line 69). Error details are NOT displayed. Good.
- In **development** (`import.meta.env.DEV`), the error message is shown in a red box (line 74-76). Expected behavior.
- The boundary reports errors to `/api/errors/client` including `error.message`, `error.stack`, and `pathname` (lines 33-42). This is a telemetry endpoint, not user-facing. Acceptable.
- The boundary correctly preserves auth session on crash (comment on line 45-46, no logout call). Good.

### 3.4 Error Stack in Telemetry
**File:** `client/src/components/GlobalErrorBoundary.tsx:33-42`
The `error.stack` is sent to `/api/errors/client` in production. This is server-side telemetry, not user-facing. Low risk unless that endpoint has no auth and logs are publicly accessible (separate server concern).

---

## 4. Route Guard / Private Route

### 4.1 Architecture Overview
**File:** `client/src/App.tsx:140-254,369-391,546-561,641-721`

The routing uses a layered defense model:

1. **`Router()` (line 641)**: Top-level route dispatch. Public routes (`/kiosk`, `/guest/*`, `/table/*`, `/login`, `/register`, `/forgot-password`, `/reset-password`, `/receipt/*`, `/kds/wall`) are handled first. Everything else falls through to `ProtectedRoute > ProtectedPages`.

2. **`ProtectedRoute` (line 369)**: Checks `useAuth()` for a user. If `isLoading`, shows spinner. If no user, redirects to `/login`. This is the authentication gate.

3. **`GuardedRoute` (line 212)**: Checks role AND subscription feature access. Uses the `routeAccessMap` (lines 146-188) which maps every route to allowed roles and required feature keys.

4. **`AdminRoute` (line 546)**: Separate auth gate for `/admin/*` — requires `super_admin` role.

5. **`PublicOnly` (line 500)**: Redirects authenticated users away from login/register.

### 4.2 Loading State Race Condition
**File:** `client/src/App.tsx:372-378`

[VERIFIED] **Properly handled.** `ProtectedRoute` shows a loading spinner while `isLoading` is true. No route content is rendered during the loading phase. Same pattern in `AdminRoute` (line 549) and `PublicOnly` (line 503). No flash-of-unauthorized-content.

### 4.3 GuardedRoute Subscription Loading
**File:** `client/src/App.tsx:233-239`

[VERIFIED] **Properly handled.** When subscription data is loading (`isSubLoading`), a spinner is shown. Feature access check happens only after loading completes.

### 4.4 Role Check is Client-Side Only
[VERIFIED] **Important architectural note.** The `routeAccessMap` and `GuardedRoute` are purely client-side enforcement. They prevent rendering the component, but the API endpoints backing those pages must independently enforce authorization. A user can bypass all client-side guards by calling APIs directly. This is expected for SPAs but worth noting — the server-side authorization is the real security boundary.

### 4.5 Unauthenticated Routes
[VERIFIED] The following routes are rendered **without any auth wrapper**:
- `/kiosk` (line 644) — Kiosk self-order page. No `useAuth()` call in `kiosk.tsx`.
- `/guest/*` (line 648-654) — Guest ordering.
- `/table/*` (line 657-665) — Table QR page.
- `/kds/wall` (line 703-705) — Kitchen display wall screen. No `useAuth()` in `kds-wall.tsx`. Auth is via `?token=` or `?tenantId=` query parameter (line 833-836).
- `/receipt/:id` (line 708-714) — Public receipt view.
- `/login`, `/register`, `/forgot-password`, `/reset-password` — Expected.

**The `/kds/wall` route is notable:** it uses a `?tenantId=` query parameter to establish context with no session authentication (confirmed: zero `useAuth` imports). This maps to the server-side finding F-136 where `/api/kds/wall-tickets?tenantId=` also lacks auth.

### 4.6 Admin Route Security
**File:** `client/src/App.tsx:518-561`

[VERIFIED] `AdminRoute` checks for `super_admin` role. However, the individual admin pages inside `AdminShell` (lines 522-540) have **no per-page role checks** — once past the super_admin gate, all admin pages are accessible. This is acceptable if super_admin is a single omnipotent role.

---

## 5. Service Worker

**File:** `client/public/sw.js` (102 lines)

### 5.1 Caching Strategy
[VERIFIED] **Clean design:**
- **Precaches:** Only `/`, `/favicon.png`, `/offline.html` (line 2). No API responses or sensitive data precached.
- **API bypass:** Requests to `/api/` and `/ws` are explicitly excluded from caching (line 22-24). Good — no auth tokens, session data, or API responses cached.
- **Navigation fallback:** Navigation requests fall back to `/offline.html` on network failure (lines 26-32). No cached authenticated pages served.
- **Static assets:** JS, CSS, images, fonts are cached with a network-first-then-cache strategy (lines 41-55). These contain no user-specific data.

### 5.2 Push Notification Handler
[VERIFIED] Lines 58-79: Standard push notification handler. Parses notification data, shows OS notification. No sensitive data stored or logged.

### 5.3 Notification Click Handler
[VERIFIED] Lines 81-101: Opens the relevant URL on notification click. Uses `event.notification.data?.url || "/kitchen"` — the URL comes from the push payload (server-controlled). No user input in the URL path.

### 5.4 Cache Key
[VERIFIED] Cache name is `"table-salt-v1"` (line 1). Old caches are cleaned up on activation (lines 10-16). No versioning issue.

**Assessment:** The service worker is minimal and safe. It does not cache any authenticated content, API responses, or sensitive data.

---

## Summary of New Findings

| ID | Severity | Category | File | Line(s) | Description |
|----|----------|----------|------|---------|-------------|
| F-205 | Medium | XSS | `client/src/components/pos/BillPreviewModal.tsx` | 2105 | `document.write(data.html)` writes server-returned HTML to print popup with zero client-side sanitization |
| F-206 | Medium | XSS | `client/src/components/pos/PosSessionModal.tsx` | 150 | Payment method names interpolated into HTML template string without escaping — stored XSS via malicious method name |
| F-207 | Medium | XSS | `client/src/pages/modules/parking.tsx` | 292-312 | 8+ user-input fields (vehicleNumber, vehicleColor, customerName, keyTagNumber, conditionReport.notes) interpolated into print popup HTML without escaping |
| F-208 | Medium | Info Leak | (40+ files) | (see section 3.2) | Raw server error messages (`e.message`) displayed verbatim in toast notifications across entire app — zero client-side message sanitization |
| F-209 | Info | XSS | `client/src/components/ui/chart.tsx` | 79 | `dangerouslySetInnerHTML` in style tag — not exploitable (developer-supplied config only) |
| F-210 | Info | Client Security | `client/public/sw.js` | 22-24 | Service worker correctly excludes `/api/` and `/ws` from cache — no sensitive data cached |

---

## Open Questions

1. **Server-side error messages:** What does the server return in error JSON bodies? If raw Drizzle/PostgreSQL errors leak through, the client's verbatim display (F-208) becomes a higher-severity information disclosure issue.
2. **Print API HTML generation:** Does `POST /api/print/receipt/:billId` (consumed at BillPreviewModal.tsx:2101-2105) use HTML escaping for user data in its response? If not, F-205 escalates to High.
3. **Payment method names:** Can users or admins create custom payment method names, or are they from a fixed enum? If customizable, F-206 is exploitable.
4. **KDS wall token rotation:** The wall screen at `/kds/wall?token=` — how are tokens generated and can they be rotated? (Related to existing F-058.)

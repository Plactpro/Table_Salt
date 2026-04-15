# Phase 8 — Frontend Security and State Audit

**Date:** 2026-04-15
**Scope:** Auth state, POS module, XSS vectors, secrets, error handling, route guards, WebSocket client, accessibility basics.

---

## 1. Frontend Auth State Management

**File:** `client/src/lib/auth.tsx`

### How Auth State Is Tracked

- Auth state via React Query: `GET /api/auth/me` with `staleTime: Infinity` (line 98)
- On success: returns `AuthUser` (id, tenantId, username, name, email, phone, role, active, outletId)
- On 401: returns `null` (line 93)
- Tenant data: separate query to `GET /api/tenant` enabled only when user is authenticated (line 141)
- Session cookie (`ts.sid`): httpOnly, managed by browser — frontend cannot read it

### Session Expiry Handling

- `queryClient.ts:140-153`: On 401 from any query, dispatches `session-conflict` event if code is `SESSION_CONFLICT`, otherwise clears query cache and redirects to `/auth`
- `queryClient.ts:226-233`: Same 401 handling for mutations
- `useIdleTimer` hook (imported at App.tsx:28): client-side idle detection (mirrors server's idle timeout)
- **Positive:** Frontend does not store tokens in localStorage/sessionStorage — relies entirely on httpOnly session cookie

### Logout Behavior

```typescript
const logout = async () => {
  try { await logoutMutation.mutateAsync(); } catch {}
  queryClient.clear();
  window.location.href = "/auth";
};
```

Calls `POST /api/auth/logout`, clears React Query cache, redirects to login. **Does NOT clear localStorage** — POS cart data (including PII) persists. Server-side logout does not destroy session (F-160).

---

## 2. Authorization: Frontend vs Backend

### Frontend Route Guards (App.tsx:139-187)

Three-layer defense:

| Guard | Purpose | Implementation |
|-------|---------|---------------|
| `ProtectedRoute` | Auth gate — redirects to `/auth` if not authenticated | Checks `user` from useAuth; shows loader during `isLoading` |
| `GuardedRoute` | Role + subscription check | Checks `user.role` against `routeAccessMap[path].roles` AND `hasFeatureAccess(featureKey)` |
| `AdminRoute` | Super admin gate | Checks `user.role === "super_admin"` |

**Loading state handling:** `ProtectedRoute` shows `PageLoader` while `isLoading` is true (App.tsx). **No flash of unauthorized content** — the guard blocks rendering until auth is resolved. Good.

**Frontend-only authorization (display/hide):** `client/src/lib/permissions.ts` provides `can(role, action)` used throughout components to show/hide UI elements. This is correct — it's for UI convenience, not security enforcement. Backend enforces actual access.

### Backend-Uncovered Gaps

The following UI-level guards have no matching backend enforcement:

| Frontend Guard | Backend Reality |
|---------------|----------------|
| POS page restricted to certain roles (App.tsx:146) | `POST /api/orders` uses `requireAuth` only — any authenticated user can create orders |
| Billing page restricted to owner/franchise_owner/hq_admin (App.tsx:160) | `GET /api/billing/*` uses `requireAuth` only in some paths |
| Feature gating by subscription tier (hasFeatureAccess) | **No server-side subscription tier check** on any API endpoint — UI-only gating |

**Critical observation:** Subscription-based feature gating (basic/standard/premium/enterprise) is enforced **only in the frontend** via `useSubscription().hasFeatureAccess()`. The server has no middleware that checks the tenant's plan before allowing access to plan-gated features. A user on the "basic" plan can call any API endpoint available to "enterprise" directly.

---

## 3. POS Module Analysis

**File:** `client/src/pages/modules/pos.tsx` (~1900 lines)

### Cart State

- **Storage:** React `useState` (`tabs: OrderTab[]`), persisted to `localStorage` key `pos_tabs_v2` and IndexedDB via `syncManager`
- **localStorage scope:** Global — NOT scoped per user or tenant. Key is the literal string `"pos_tabs_v2"`.
- **Cart contains:** Item IDs, names, prices, quantities, modifiers, customer name, customer phone, order notes, discount, selected table
- **On logout:** `queryClient.clear()` runs but `localStorage` is NOT cleared — cart data with PII persists

### Bill Total Calculation (pos.tsx:805-876)

All calculations are client-side:

```
subtotal = Σ(item.price * item.quantity - itemDiscounts)
manualDiscount = parseFloat(tab.discount)
totalDiscount = offerDiscount + manualDiscount + engineDiscount
afterDiscount = max(0, subtotal - totalDiscount)
serviceCharge = afterDiscount * tenantServiceChargePct
taxBase = compoundTax ? afterDiscount + serviceCharge : afterDiscount
tax = taxBase * taxRate
total = afterDiscount + serviceCharge + tax
```

### What's Sent to Server

| Endpoint | What's trusted from client | Server recalculates? |
|----------|---------------------------|---------------------|
| `POST /api/orders` | Item IDs, quantities, modifiers, table, notes | **YES** — server resolves prices, evaluates promos, computes tax |
| `POST /api/restaurant-bills` | **subtotal, discountAmount, serviceCharge, taxAmount, totalAmount** | **NO** — stored as-is |
| `POST /api/restaurant-bills/:id/payments` | Payment amounts, methods | Validates sum matches bill total (but bill total was client-submitted) |

### Loyalty Tier Discount

`BillPreviewModal.tsx:1438-1469`: Hardcoded tier discount percentages on the client:
- Bronze: 0%, Silver: 5%, Gold: 10%, Platinum: 15%

The tier discount is computed client-side and included in `discountAmount` sent to `POST /api/restaurant-bills`. The server does not verify the customer's actual loyalty tier or the correctness of the discount percentage.

### Offline / Sync Behavior

- `syncManager` queues orders in IndexedDB when offline (pos.tsx:1241-1244)
- On reconnection, queued orders are synced (pos.tsx:580-586)
- Version conflicts detected via HTTP 409 + `VERSION_CONFLICT` code (pos.tsx:1021-1031)
- **Fire-and-forget concern:** `recallHeldTab` sends `PATCH /api/orders/:id` with `status: "in_progress"` using `.catch(() => {})` (pos.tsx:1084). If this fails, server thinks order is on hold while client shows it active.

---

## 4. XSS Analysis

### Vectors Found

| File | Line | Vector | Exploitable? | Severity |
|------|------|--------|-------------|----------|
| `components/ui/chart.tsx` | 79 | `dangerouslySetInnerHTML` on `<style>` | No — developer config only | Info |
| `pages/modules/menu.tsx` | 915 | `innerHTML` (SVG fallback) | No — hardcoded SVG | Info |
| `components/pos/BillPreviewModal.tsx` | 2105 | `document.write(data.html)` in print popup | **Yes if server HTML contains user data** | Medium |
| `components/pos/PosSessionModal.tsx` | 150 | Payment method names interpolated into HTML | **Yes if method names are user-configurable** | Medium |
| `pages/modules/parking.tsx` | 292-312 | 8+ user fields (vehicle, name, notes) in print HTML | **Yes — user input directly in HTML** | Medium |

### No `eval`, `new Function`, or `srcdoc` found. React JSX auto-escaping covers all standard rendering paths.

### CSP Correlation (F-020)

The CSP allows `'unsafe-inline'` and `'unsafe-eval'` in `script-src`. If any XSS vector above is exploitable, the CSP provides no mitigation — injected scripts will execute freely.

---

## 5. Secrets in Frontend Bundle

**Clean.** No hardcoded API keys, JWT secrets, encryption keys, or private keys found anywhere in `client/src/`. Specifically verified:
- No `process.env` references for secrets
- No `VITE_*` environment variables
- VAPID public key fetched at runtime from `/api/push/vapid-public-key`
- Stripe publishable key fetched from server
- Razorpay key ID fetched from server

---

## 6. Error Handling / Information Leakage

### Error Display Pattern

`queryClient.ts:17`: Error message format is `"<status>: <server message>"`. This is displayed in toast notifications across 40+ files via:
```typescript
toast({ title: "Error", description: e.message });
```

If the server ever returns raw database errors, SQL syntax, or stack traces in its JSON error response, they reach the user verbatim. The `throwIfResNotOk` function (queryClient.ts:8-21) extracts `body.message` from the server response — whatever the server puts in `{ message: "..." }` goes straight to the UI.

### GlobalErrorBoundary

`client/src/components/GlobalErrorBoundary.tsx`: Catches React rendering errors. In production, shows a generic "Something went wrong" message. In development, shows full error details. Error telemetry sent to `POST /api/errors/client`. **Good.**

---

## 7. Route Guard / Private Route Analysis

### Guard Structure

```
App.tsx
├── Public routes (no guard): /auth, /register, /forgot-password, /reset-password, /guest/*, /kiosk, /kds/wall, /table-qr/*
├── ProtectedRoute (auth required)
│   ├── GuardedRoute (role + feature check per routeAccessMap)
│   │   └── <PageComponent />
│   └── AdminRoute (super_admin only)
│       └── <AdminPageComponent />
```

### Flash-of-Content Risk

- `ProtectedRoute` returns `<PageLoader />` while `isLoading` is true — **no flash**
- `GuardedRoute` returns `<AccessDenied />` if role check fails — **no flash**
- `AdminRoute` returns redirect if not super_admin — **no flash**

### Unauthenticated Pages

`/kds/wall` is fully unauthenticated on the frontend. The KDS wall screen page uses `?tenantId=` query param to fetch data. This matches the server-side finding F-136 — the wall ticket endpoint is also unauthenticated.

---

## 8. WebSocket Client Behavior

**File:** `client/src/hooks/use-realtime.ts`

| Aspect | Implementation | Assessment |
|--------|---------------|------------|
| Connection | Session cookie auto-sent by browser | Good |
| Reconnect | Exponential backoff, 1s-30s, max 10 attempts | Good |
| Fast retry on crash | 1s delay on close code 1006 | Good |
| Heartbeat | Client ping every 25s, responds to server ping within 10s | Good |
| Max attempts indicator | `RealtimeStatusBanner` shows connection lost | Good |
| **Event dedup** | **None** — handlers fire for every message | Gap (F-170) |
| **Offline queue** | **None** — events during disconnect lost permanently | Gap (F-171) |
| **Reconnect storm** | All clients retry at 1s on server restart | Gap (F-172) |

### UI Impact of WS Failures

Most event handlers call `queryClient.invalidateQueries()` which triggers a fresh `GET` from the server. This is **idempotent and self-correcting** — even if an event is missed, the next interaction or refetch will get the current state. The main risk is **stale UI** between disconnect and next interaction, not incorrect UI state.

---

## 9. Accessibility Assessment (WCAG AA Basics)

Not an exhaustive accessibility audit, but key observations from the code:

| Aspect | Finding |
|--------|---------|
| Keyboard navigation | shadcn/ui (Radix) components provide keyboard support natively. POS page uses keyboard shortcuts (pos.tsx). |
| ARIA labels | Present on interactive components via Radix primitives. Custom components (buttons, dialogs) generally use semantic HTML. |
| Focus management | Dialogs auto-focus via Radix. Modal `onOpenAutoFocus` used. |
| Color contrast | Theme uses `neutral` base color (components.json). Dark mode supported via `next-themes`. Specific contrast ratios not verified. |
| Screen reader support | `sonner` toast announcements. Error states in forms use `aria-invalid`. |
| RTL support | Automatic via `dir="rtl"` attribute (App.tsx, triggered for Arabic language). |
| **Gap:** | No `aria-live` regions for real-time order/KDS updates — screen readers won't announce incoming orders |
| **Gap:** | POS page relies heavily on drag-and-drop and touch targets that may not have keyboard equivalents |

---

## 10. Findings Summary

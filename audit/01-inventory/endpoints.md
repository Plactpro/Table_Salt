# Phase 1 — API Endpoints Inventory

**Total endpoints:** ~904 across 48 router files + admin-routes + kds-allergy-ack + index.ts
**Source:** `server/routes.ts`, `server/admin-routes.ts`, `server/routers/*.ts`, `server/routes/*.ts`, `server/index.ts`

---

## Global Endpoints (server/index.ts)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/stripe/webhook` | Stripe signature | Stripe managed webhook (registered BEFORE express.json) |
| POST | `/api/webhooks/razorpay` | Razorpay HMAC signature | Razorpay payment webhook (registered BEFORE express.json) |
| GET | `/api/health` | None | Health check (DB, pool, memory, WS count, circuit breakers) |
| POST | `/api/admin/circuit-breakers/reset` | None (!) | Reset all circuit breakers to CLOSED |
| POST | `/api/errors/client` | None | Client-side error logging |

## Upload Endpoints (server/routes.ts)

| Method | Path | Auth | Config |
|--------|------|------|--------|
| POST | `/api/upload/image` | requireAuth | multer memory, 5MB limit, jpg/png/gif/webp |
| POST | `/api/upload/video` | requireAuth | multer memory, 50MB limit, mp4/webm |
| GET | `/uploads/:filename` | None | Static file serving with security headers for HTML |

## Circuit Breaker Coverage (server/routes.ts)

| Path Prefix | CB Group | Scope |
|-------------|----------|-------|
| `/api/orders` | orders | Non-GET only |
| `/api/order-items` | orders | Non-GET only |
| `/api/billing` | billing | All methods |
| `/api/restaurant-billing` | billing | All methods |
| `/api/cash-machine` | billing | All methods |
| `/api/kitchen` | kitchen | Non-GET only |
| `/api/kds` | kitchen | Non-GET only |
| `/api/reports` | reports | All methods |
| `/api/inventory` | inventory-mutations | Non-GET only |
| `/api/stock-adjustments` | inventory-mutations | Non-GET only |
| `/api/stock-counts` | inventory-mutations | Non-GET only |
| `/api/wastage` | inventory-mutations | Non-GET only |

## CSRF Exemptions (server/security.ts)

These paths skip CSRF validation on mutating requests:
- `/api/auth/login`
- `/api/auth/register`
- `/api/auth/forgot-password`
- `/api/auth/reset-password`
- `/api/webhooks/stripe`
- `/api/guest/*`
- `/api/kiosk/*`
- `/api/table-requests`
- `/api/errors/client`
- `/api/aggregator/webhook/*`
- `/api/ad-impressions`

---

## Admin Routes (server/admin-routes.ts) — 38 endpoints

### Bootstrap (Unauthenticated)
| Method | Path | Auth |
|--------|------|------|
| POST | `/api/platform/setup` | None (one-time, fails if super admin exists) |
| POST | `/api/admin/setup` | None (alias) |

### Impersonation
| Method | Path | Auth |
|--------|------|------|
| POST | `/api/session/impersonate/:userId` | requireSuperAdmin |
| POST | `/api/admin/impersonate/:userId` | requireSuperAdmin |
| POST | `/api/session/impersonate/end` | requireAuth |
| POST | `/api/admin/impersonate/end` | requireAuth |
| POST | `/api/admin/impersonation/end` | requireAuth |
| GET | `/api/session/impersonation/status` | requireAuth |
| GET | `/api/admin/impersonation/status` | requireAuth |
| POST | `/api/admin/impersonation/unlock-edit` | requireAuth |
| POST | `/api/admin/impersonation/return-readonly` | requireAuth |

### Tenant Management
| Method | Path | Auth |
|--------|------|------|
| GET | `/api/admin/tenants` | requireSuperAdmin + requireFreshSession |
| GET | `/api/admin/tenants/:id` | requireSuperAdmin + requireFreshSession |
| POST | `/api/admin/tenants` | requireSuperAdmin + requireFreshSession |
| PATCH | `/api/admin/tenants/:id` | requireSuperAdmin + requireFreshSession |
| POST | `/api/admin/tenants/:id/suspend` | requireSuperAdmin + requireFreshSession |
| POST | `/api/admin/tenants/:id/reactivate` | requireSuperAdmin + requireFreshSession |

### User Management
| Method | Path | Auth |
|--------|------|------|
| GET | `/api/admin/users` | requireSuperAdmin + requireFreshSession |
| PATCH | `/api/admin/users/:id` | requireSuperAdmin + requireFreshSession |
| POST | `/api/admin/users/:id/reset-password` | requireSuperAdmin + requireFreshSession |

### Super Admin Management
| Method | Path | Auth |
|--------|------|------|
| GET | `/api/admin/super-admins` | requireSuperAdmin |
| POST | `/api/admin/super-admins` | requireSuperAdmin + requireFreshSession |
| DELETE | `/api/admin/super-admins/:id` | requireSuperAdmin + requireFreshSession |

### Audit & Security
| Method | Path | Auth |
|--------|------|------|
| GET | `/api/admin/audit-log` | requireSuperAdmin + requireFreshSession |
| GET | `/api/admin/audit-log/export` | requireSuperAdmin + requireFreshSession |
| GET | `/api/admin/security-alerts` | requireSuperAdmin + requireFreshSession |
| PATCH | `/api/admin/security-alerts/:id/acknowledge` | requireSuperAdmin + requireFreshSession |
| GET | `/api/admin/detection-alerts` | requireSuperAdmin + requireFreshSession |
| PATCH | `/api/admin/detection-alerts/:id/dismiss` | requireSuperAdmin + requireFreshSession |

### Platform Config
| Method | Path | Auth |
|--------|------|------|
| GET | `/api/admin/stats` | requireSuperAdmin |
| GET | `/api/admin/analytics` | requireSuperAdmin |
| GET | `/api/admin/platform-settings` | requireSuperAdmin |
| PATCH | `/api/admin/platform-settings` | requireSuperAdmin + requireFreshSession |
| GET | `/api/admin/platform-settings/gateway` | requireSuperAdmin |
| PATCH | `/api/admin/platform-settings/gateway` | requireSuperAdmin + requireFreshSession |
| GET | `/api/platform/gateway-config` | None (public) |
| POST | `/api/admin/encryption/rotate-key` | requireSuperAdmin + requireFreshSession |

### Tenant Access
| Method | Path | Auth |
|--------|------|------|
| GET | `/api/tenant/access-log` | requireAuth + requireRole(owner, manager) |
| GET | `/api/tenant/access-preferences` | requireAuth + requireRole(owner, manager) |
| PATCH | `/api/tenant/access-preferences` | requireAuth + requireRole(owner, manager) |

### Diagnostics
| Method | Path | Auth |
|--------|------|------|
| GET | `/api/admin/diag/orders-insert-test` | requireSuperAdmin |
| GET | `/api/admin/vendor-risks` | requireSuperAdmin + requireFreshSession |
| POST | `/api/admin/vendor-risks` | requireSuperAdmin + requireFreshSession |
| PATCH | `/api/admin/vendor-risks/:id` | requireSuperAdmin + requireFreshSession |
| DELETE | `/api/admin/vendor-risks/:id` | requireSuperAdmin + requireFreshSession |
| GET | `/api/admin/incident-playbook` | requireSuperAdmin + requireFreshSession |
| POST | `/api/admin/incident-playbook/steps` | requireSuperAdmin + requireFreshSession |
| PATCH | `/api/admin/incident-playbook/steps/:id` | requireSuperAdmin + requireFreshSession |
| DELETE | `/api/admin/incident-playbook/steps/:id` | requireSuperAdmin + requireFreshSession |
| GET | `/api/admin/audit-archive` | requireSuperAdmin + requireFreshSession |
| GET | `/api/admin/system-events` | requireSuperAdmin |

---

## Router Endpoints by File

*Note: Due to the volume (~865 endpoints across 48 router files), endpoints are summarized by router with auth patterns. Full per-endpoint detail is available by reading the individual router files.*

### Auth (routers/auth.ts)
- `POST /api/auth/register` — No auth
- `POST /api/auth/login` — No auth (passport-local)
- `POST /api/auth/logout` — No auth
- `GET /api/auth/me` — requireAuth
- `POST /api/auth/change-password` — requireAuth
- `POST /api/auth/forgot-password` — No auth
- `POST /api/auth/reset-password` — No auth
- `POST /api/auth/totp/setup` — requireAuth
- `POST /api/auth/totp/verify` — requireAuth
- `POST /api/auth/totp/disable` — requireAuth
- `POST /api/auth/pin/set` — requireAuth
- `POST /api/auth/pin/login` — No auth
- **Additional auth-related endpoints** (recovery codes, session management)

### Users (routers/users.ts)
- `GET /api/users` — requireAuth
- `POST /api/users` — requireRole(owner, manager)
- `PATCH /api/users/:id` — requireRole(owner, manager) + requireFreshSession
- `DELETE /api/users/:id` — requireRole(owner, manager)
- `GET /api/outlets` — requireAuth
- `POST /api/outlets` — requireRole(owner, manager)
- `PATCH /api/outlets/:id` — requireRole(owner, manager)
- **GDPR endpoints:** export, delete-account, anonymize, restriction management

### Menu (routers/menu.ts)
- CRUD for menu categories and items — requireAuth / requireRole(owner, manager) + requirePermission(manage_menu)
- Bulk operations, import/export, availability toggle

### Orders (routers/orders.ts) — largest router, ~50+ endpoints
- Full order lifecycle: create, update status, void, cancel, split bill, merge tables, transfer tables
- Delivery flow: accept, reject, dispatch
- Hold/release, archive stale orders
- Item-level CRUD within orders
- **requireAuth** for most; some with requireRole

### Kitchen (routers/kitchen.ts) — ~30+ endpoints
- KDS item status updates, bulk status, cooking timers
- KOT send, course fire, rush orders
- Recipe deduction, wastage logging
- Hold/release items, overdue alerts
- **requireAuth** for most; station CRUD requires requireRole(owner, manager)

### Restaurant Billing (routers/restaurant-billing.ts)
- Bill creation, payment processing (Stripe/Razorpay/cash/split)
- Void bills, refunds
- `GET /api/public/receipt/:id` — **No auth (public receipt)**
- **requireAuth** for all others

### Tables (routers/tables.ts)
- Table CRUD, zone CRUD, seat/unseat, merge/unmerge, transfer
- **requireAuth** for reads; requireRole(owner, manager) for mutations

### Reservations (routers/reservations.ts)
- CRUD + status management — **requireAuth**; DELETE requires requireRole(owner, manager)

### Inventory (routers/inventory.ts)
- Stock adjustments, expiry tracking, movement history
- **requireAuth** for all

### Staff (routers/staff.ts)
- Schedule CRUD — requireRole(owner, manager)
- Dashboard data — requireAuth

### Customers (routers/customers.ts)
- CRUD + loyalty management — **requireAuth**

### Billing/Subscription (routers/billing.ts)
- Stripe checkout, subscription management, plan changes
- **requireAuth**

### Tenant (routers/tenant.ts)
- Tenant settings, offers CRUD
- PATCH requires requireRole(owner)
- Offers require requirePermission(manage_offers)

### Delivery (routers/delivery.ts)
- Delivery order management, driver assignment
- **requireAuth**

### Guest (routers/guest.ts) — **No auth (public)**
- `GET /api/guest/menu/:outletId/categories`
- `GET /api/guest/menu/:outletId/categories/:categoryId/items`
- `GET /api/guest/menu/:outletId`
- Guest ordering from QR code

### Kiosk (routers/kiosk.ts)
- Device CRUD — requireRole(owner, manager)
- Guest-facing kiosk endpoints may be unauthenticated

### Table Requests (routers/table-requests.ts)
- QR code flow (no auth): session start/join, item add/remove, request submit
- Staff side (requireAuth): approve/reject/complete requests

### Prep Notifications (routers/prep-notifications.ts) — **No auth on reads**
- `GET /api/prep-notifications/unread-count` — **No auth**
- `GET /api/prep-notifications` — **No auth**
- `PATCH /api/prep-notifications/:id/read` — **No auth**

### Push Subscriptions (routers/push-subscriptions.ts)
- `GET /api/push/vapid-public-key` — **No auth**
- `POST /api/push/subscribe` — requireAuth
- `DELETE /api/push/unsubscribe` — requireAuth

### Contact (routers/contact.ts) — **No auth (public)**
- `POST /api/contact-sales` — No auth
- `POST /api/contact-support` — No auth

### Cash Machine (routers/cash-machine.ts)
- `POST /api/cash-sessions/calculate-change` — **No auth**
- Session open/close/payment — requireAuth

### Tip Management (routers/tip-management.ts)
- `GET /api/tips/config/:outletId` — **No auth**
- Settings CRUD — requireRole(owner, manager)
- Reports — requireRole(manager, owner)

### Additional Routers (requireAuth unless noted)
- **Attendance** — clock in/out, settings
- **Cleaning** — template/task CRUD
- **Compliance** — security alerts, health checks
- **Coordination** — dashboard, messages, status updates
- **Service Coordination** — live orders, VIP flagging, course management
- **Franchise** — region CRUD
- **Procurement** — PO, GRN, returns, RFQ, stock count, stock transfer
- **Workforce** — dashboard, timesheet, alerts
- **Permissions** — permission check, supervisor verify
- **Kitchen Assignment** — counter CRUD, chef availability, ticket assignment
- **Stock Reports** — scheduler management, report generation
- **Modifications** — order item modifications, allergy alerts
- **Modifiers** — modifier group CRUD
- **Wastage** — dashboard, trends, logging
- **Printers** — printer CRUD, print job management
- **Pricing** — outlet price overrides
- **Time Performance** — KOT timing events
- **Ticket History** — void requests, refire, timeline
- **Alert System** — alert definitions, event management
- **Packing Charges** — settings CRUD
- **Support** — ticket CRUD, replies
- **Onboarding** — checklist management
- **Resources** — special resource CRUD, availability
- **Parking** — valet tickets, zones, charges, QR-based retrieval
- **Ads** — campaign CRUD, creatives, impressions, revenue
- **Reports** — generation, export, status
- **Cash Drawer Log** — drawer activity log
- **Campaigns** — campaign CRUD, send
- **Leave** — leave request CRUD, approval
- **Recycle Bin** — archive/restore across entities
- **Channels** — order channel CRUD
- **Events** — event CRUD
- **KDS Allergy Ack** (routes/kds-allergy-ack.ts) — `PATCH /api/kds/items/:id/acknowledge-allergy`

---

## Auth Pattern Summary

| Auth Level | Count (approx) | Used For |
|------------|----------------|----------|
| No auth | ~40 | Public: guest menu, QR flows, webhooks, health, contact forms, VAPID key, cash calculator, public receipts, prep notifications |
| requireAuth | ~600 | Standard authenticated operations |
| requireRole(...) | ~200 | Role-gated operations (owner, manager, etc.) |
| requireSuperAdmin | ~30 | Platform administration |
| requireFreshSession | ~25 | High-security operations (added on top of requireAuth/requireSuperAdmin) |
| requirePermission(...) | ~10 | Fine-grained permission checks |

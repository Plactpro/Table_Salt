# Audit Phase 0 — Orientation Snapshot
Date: 2026-04-27
Repo state: branch `main`, commit `e7df12b`, working tree clean.

## 1. What this codebase is

Table Salt is a multi-tenant restaurant management SaaS (PLACTPRO LLC, Dubai) that lets a restaurant operator run point-of-sale, kitchen tickets, table service, menus, orders, billing, payments, staff, inventory, parking/valet, loyalty and reporting from one web app. Customers are individual restaurant tenants; each tenant has multiple outlets, staff with different roles, and may use guest QR ordering or self-service kiosks. The product targets UAE (VAT, Razorpay/Stripe), India (GST, Razorpay) and is now expanding globally with multi-currency and i18n (EN/ES/AR/FR). It is pre-launch with demo data only; production is auto-deployed to Railway at www.inifinit.com from `main`.

## 2. Repo layout

```
server/                       Express 5 + TypeScript backend (tsx in dev, esbuild bundle in prod)
  routers/                      57 feature routers (auth, orders, menu, KDS, billing, parking, etc.)
  routes/                       1-off route module (KDS allergy ack)
  services/                     Background services & domain helpers (schedulers, mailers, charges)
  lib/                          Cross-cutting utilities (circuit-breaker, tenant-assertion, query-logger, hmac)
  middleware/                   Single middleware (check-restriction)
  templates/                    Email/HTML templates
  mock-feeds/                   Mock external aggregator feeds
  index.ts                      App bootstrap, migrations runner, schedulers, WS, health
  routes.ts                     Mounts all routers
  auth.ts                       Passport local + session + PIN
  security.ts                   Helmet, CSRF, IP allowlist
  storage.ts                    Drizzle storage layer (DAL)
  db.ts                         pg Pool
  realtime.ts                   WebSocket server
  stripe.ts / stripeClient.ts   Stripe + stripe-replit-sync
  razorpay.ts                   Razorpay HMAC verify
  encryption.ts                 AES-256-GCM field encryption
  admin-routes.ts               Super-admin endpoints
  admin-migrations*.ts          Boot-time ad-hoc migration runners
  seed.ts                       Boot-time seeders
client/                       React 19 + Vite SPA
  src/pages/                    Route-level pages (admin, dashboards, modules, kds, pos, kiosk, etc.)
  src/components/               UI + feature components (admin, cash, coordination, layout, ui, etc.)
  src/hooks/                    React hooks
  src/lib/                      Frontend utilities
  src/i18n/                     i18next locales (en, es, ar, fr)
  index.html                    Main SPA entry
  qr.html                       Separate guest QR entry bundle
  qr-entry.tsx                  QR app shell
  App.tsx, main.tsx             Main SPA shell
shared/                       Code shared between server + client (alias @shared/*)
  schema.ts                     Drizzle schema, 179 tables, 5,951 lines
  permissions-config.ts         RBAC permission catalog
  currency.ts, jurisdictions.ts ISO currency + tax/region lists
  allergens.ts, units.ts        Static reference data
  pin-utils.ts                  PIN hashing helpers
audit/                        Output directory of prior audit passes (this phase appends here)
migrations/                   Drizzle versioned migrations (only 1 SQL snapshot present)
scripts/                      One-off operational scripts (seeders, post-merge, super-admin creator)
script/                       Build script (tsx-based esbuild)
tests/                        Vitest unit/integration + Playwright e2e/
docs/                         Audits, session reports, testing docs
attached_assets/              Screenshots and pasted prompts (developer notes, not code)
local-scratch/                Gitignored working notes
.auth/                        Gitignored Playwright auth state files
node_modules/                 (ignored)
```

## 3. Tech stack — verified

From `package.json` (Node 20 per `Dockerfile`, TypeScript 5.6.3):

Frameworks and core libraries
- express 5.0.1 — HTTP server
- vite 7.1.9 — frontend bundler/dev server
- react 19.2.0, react-dom 19.2.0 — UI
- wouter 3.3.5 — client routing
- @tanstack/react-query 5.60.5 — data fetching
- @tanstack/react-virtual 3.13.23 — virtualization
- tailwindcss 4.1.14 + @tailwindcss/vite 4.1.14 — styling
- shadcn / @radix-ui/react-* (28 packages, all 1.x/2.x) — UI primitives
- framer-motion 12.23.24, lucide-react 0.545.0, sonner 2.0.7
- compression 1.8.1, helmet 8.1.0
- ws 8.18.0 — WebSocket
- zod 3.25.76, zod-validation-error 3.4.0, drizzle-zod 0.7.0
- recharts 2.15.4, jspdf 4.2.1, jspdf-autotable 5.0.7, sharp 0.34.5, jszip 3.10.1
- i18next 25.10.10, react-i18next 16.6.6, i18next-browser-languagedetector 8.2.1, i18next-http-backend 3.0.2

Auth-related libraries
- passport 0.7.0, passport-local 1.0.0
- express-session 1.18.1, connect-pg-simple 10.0.0, memorystore 1.6.7
- bcrypt 6.0.0
- otpauth 9.5.0 (TOTP)
- qrcode 1.5.4, input-otp 1.4.2

Payment-related libraries
- stripe 20.0.0
- stripe-replit-sync 1.0.0 (managed Stripe webhook + table sync)
- (Razorpay verified manually via HMAC in `server/razorpay.ts`)

Database-related libraries
- drizzle-orm 0.39.3
- drizzle-kit 0.31.4 (devDep)
- pg 8.16.3
- ioredis 5.10.1, rate-limit-redis 4.2.0
- express-rate-limit 8.3.1

Test-related libraries
- vitest 4.1.0
- @playwright/test 1.58.2, playwright 1.58.2

Other runtime deps (notable)
- node-cron 4.2.1 — schedulers
- nodemailer 8.0.3 — SMTP
- multer 2.1.1 — uploads
- @aws-sdk/client-s3 3.1015.0 + @aws-sdk/lib-storage 3.1015.0 — S3 uploads
- web-push 3.6.7 — VAPID push notifications
- date-fns 3.6.0
- tsx 4.20.5, esbuild 0.25.0

Dev dependencies
- @replit/vite-plugin-cartographer 0.4.10, @replit/vite-plugin-dev-banner 0.1.1
- @types/* (express, node, react, ws, passport, etc.)

## 4. Database schema — surface map

Source: `shared/schema.ts` (5,951 lines). Total tables defined: **179**. Table names only; columns intentionally not enumerated in Phase 0.

Tenancy, users, sessions, platform
- tenants, users, regions, outlets, session, deviceSessions, impersonationSessions, passwordResetTokens, tenantAccessPreferences, platformSettings, platformSettingsKv

Menu, modifiers, pricing
- menuCategories, menuItems, modifierGroups, modifierOptions, menuItemModifierGroups, outletMenuOverrides, outletMenuPrices, priceResolutionLog, comboOffers

Tables / dining room / QR
- tableZones, tables, tableSessions, tableQrTokens, tableQrSessions, tableRequests, waitlistEntries, reservations

Orders & POS
- orders, orderItems, orderItemModifications, orderCourses, orderTimeSummary, orderChannels, channelConfigs, onlineMenuMappings, deliveryOrders, kotEvents, dailyPlannedQuantities, vipOrderFlags

Bills, payments, POS sessions, cash
- bills, billPayments, billTips, billPackingCharges, billParkingCharges, posSessions, cashSessions, cashDrawerEvents, cashPayouts, cashHandovers, idempotencyKeys

Tips
- outletTipSettings, tipDistributions

Packing charges
- outletPackingSettings, packingChargeCategories, packingChargeExemptions

Inventory & stock
- inventoryItems, stockMovements, stockTakes, stockTakeLines, stockCheckReports, stockCheckReportItems, stockCountSessions, stockCountItems, damagedInventory, stockTransfers, stockTransferItems, wastageLogs, wastageDailySummary, wastageTargets

Recipes & timing
- recipes, recipeIngredients, recipeComponents, recipeTimeBenchmarks, dailyTimePerformance, itemTimeLogs, timePerformanceTargets

Procurement & suppliers
- suppliers, supplierCatalogItems, purchaseOrders, purchaseOrderItems, goodsReceivedNotes, grnItems, procurementApprovals, rfqs, rfqItems, supplierQuotations, quotationItems, quotationRequests, quotationRequestItems, purchaseReturns, purchaseReturnItems

Kitchen / KDS / coordination
- kitchenStations, kitchenSettings, kitchenCounters, chefRoster, chefAvailability, ticketAssignments, menuItemStations, itemVoidRequests, voidedItems, itemRefireRequests, coordinationRules, serviceMessages, prepNotifications

Print
- printJobs, printers, printerTemplates

Staff, workforce, attendance, shifts
- staffSchedules, attendanceLogs, employeePerformanceLogs, leaveRequests, leaveBalances, shifts, labourCostSnapshots

Customers, loyalty, feedback
- customers, loyaltyTransactions, loyaltyTierConfig, loyaltyTierLog, feedback

Promotions, offers, events
- offers, promotionRules, upsellRules, events

Franchise & multi-outlet billing
- franchiseInvoices

Cleaning & operational audits
- cleaningTemplates, cleaningTemplateItems, cleaningLogs, cleaningSchedules, auditTemplates, auditTemplateItems, auditSchedules, auditResponses, auditIssues

Security & compliance audit trail
- auditEvents, auditEventsArchive, securityAlerts, breachIncidents, incidentResponsePlaybook, keyManagementLog, keyStorageLocations, pciSaqLog, vendorRiskAssessments, consentLog, cookieConsentLog

Alerts & notifications
- alertDefinitions, alertOutletConfigs, alertEvents, pushSubscriptions

Support, contact, sales
- supportTickets, inAppSupportTickets, inAppSupportTicketReplies, salesInquiries

Resources (special equipment / cleaning)
- specialResources, resourceUnits, resourceAssignments, resourceCleaningLog

Parking & valet
- parkingLayoutConfig, parkingZones, parkingSlots, parkingRates, parkingRateSlabs, valetStaff, valetTickets, valetTicketEvents, valetRetrievalRequests, valetIncidents, valetShifts, valetStaffAssignments

Kiosk / guest cart
- kioskDevices, guestCartItems

Ads (marketplace)
- adCampaigns, adCreatives, adImpressions, adRevenueRecords, campaigns

Reporting, system, health
- reportCache, systemEvents, systemHealthLog

Total table count: **179**.

## 5. Server routes — surface map

Wired in `server/routes.ts:registerRoutes`. Top-level webhooks and health are wired directly in `server/index.ts` BEFORE `express.json()` (raw body required). Decision rule applied: list registration calls and the dominant `/api/...` prefix(es) each router uses; do not enumerate handlers.

Registered before json parser (in `server/index.ts`):
- `POST /api/stripe/webhook` (raw body, stripe-replit-sync)
- `POST /api/webhooks/razorpay` (raw body, custom HMAC)
- `GET /api/health` (cached 5 s, public)

Top-level wiring (in `server/routes.ts`):
- `setupAuth(app)` — Passport local + session, login/logout/me
- `setupCsrf(app)` — CSRF middleware
- `setupIpAllowlistMiddleware(app)` — IP allowlist
- `blockIfRestricted` — `server/middleware/check-restriction.ts`
- Circuit-breaker wrappers on `/api/orders` (mutations), `/api/order-items` (mutations), `/api/billing`, `/api/restaurant-billing`, `/api/cash-machine`, `/api/kitchen` (mutations), `/api/kds` (mutations), `/api/reports`, `/api/inventory` (mutations), `/api/stock-adjustments` (mutations), `/api/stock-counts` (mutations), `/api/wastage` (mutations)
- `registerAdminRoutes(app)` — super-admin endpoints
- Static `app.use("/uploads", ...)` for served upload files
- `POST /api/upload/image`, `POST /api/upload/video` (auth + multer)
- `POST /api/errors/client` — client-side error sink
- Catch-all client error handler (`app.use((err, req, res, next) => ...)`)

`register*Routes` calls and dominant URL prefix per router (inferred from route definitions; not exhaustive):

| # | Router file | Dominant prefix(es) |
|---|---|---|
| 1 | auth | /api/auth/* |
| 2 | recycle-bin | /api/recycle-bin |
| 3 | users | /api/users, /api/outlets |
| 4 | menu | /api/menu-categories, /api/menu-items |
| 5 | tables | /api/tables, /api/table-zones, /api/table-analytics |
| 6 | reservations | /api/reservations |
| 7 | orders | /api/orders, /api/order-items, /api/orders-with-offers |
| 8 | inventory | /api/inventory* |
| 9 | customers | /api/customers, /api/loyalty-tier-config |
| 10 | staff | /api/dashboard, /api/analytics, /api/reports/finance |
| 11 | billing | /api/billing/* (Stripe checkout/portal/status) |
| 12 | tenant | /api/offers, /api/promotion-rules, /api/promotions/evaluate |
| 13 | delivery | /api/contact-config, /api/contact/sales, /api/contact/support |
| 14 | contact | /api/contact-sales, /api/contact-support |
| 15 | attendance | /api/attendance/* |
| 16 | cleaning | /api/audits/* (cleaning + audit templates) |
| 17 | recipes | /api/recipes, /api/food-cost-report |
| 18 | kitchen | /api/inventory-alerts, /api/kitchen/* |
| 19 | channels | /api/aggregator/ingest, /api/channel-configs, /api/online-menu-mappings |
| 20 | franchise | /api/franchise-invoices, /api/hq/outlet-kpis |
| 21 | procurement | /api/grns, /api/goods-received-notes, /api/damaged-inventory |
| 22 | workforce | /api/workforce/* |
| 23 | permissions | /api/audit-log/* |
| 24 | kiosk | /api/kiosk/*, /api/kiosk-devices |
| 25 | guest | /api/guest/* |
| 26 | events | /api/events, /api/combo-offers |
| 27 | compliance | /api/admin/breach-incidents, /api/admin/consent-stats, /api/admin/system-health |
| 28 | restaurant-billing | /api/restaurant-bills, /api/pos/session, /api/billing/manual-pending |
| 29 | print-jobs | /api/print-jobs, /api/print/jobs, /api/print/reprint |
| 30 | table-requests | /api/qr/*, /api/table-requests |
| 31 | kitchen-assignment | /api/assignments/* |
| 32 | stock-reports | /api/stock-reports, /api/planned-quantities |
| 33 | prep-notifications | /api/prep-notifications, /api/kitchen-staff |
| 34 | push-subscriptions | /api/push/* |
| 35 | service-coordination | /api/coordination/rules, /api/delivery-agents, /api/phone-orders |
| 36 | coordination | /api/coordination/* |
| 37 | modifications | (modifications under /api/orders or /api/items) |
| 38 | wastage | /api/wastage/* |
| 39 | printers | /api/printers, /api/print/templates, /api/print/reprint |
| 40 | pricing | /api/pricing/* |
| 41 | time-performance | /api/time-performance/*, /api/recipe-benchmarks/* |
| 42 | ticket-history | /api/tickets/history |
| 43 | alert-system | /api/alerts/* |
| 44 | cash-machine | /api/cash-sessions/* |
| 45 | tip-management | /api/tips/* |
| 46 | packing-charges | /api/packing/* |
| 47 | support | /api/support/tickets |
| 48 | onboarding | /api/onboarding/* |
| 49 | resources | /api/resources/* |
| 50 | parking | /api/parking/* |
| 51 | ads | /api/ad-campaigns, /api/ad-creatives, /api/ad-impressions |
| 52 | reports | /api/reports/generate |
| 53 | cash-drawer-log | /api/cash-drawer/* |
| 54 | modifiers | /api/modifier-groups |
| 55 | campaigns | /api/campaigns |
| 56 | leave | /api/leave-requests |
| 57 | (mounted) `allergyAckRouter` from `server/routes/kds-allergy-ack.ts` |

Total registration calls: **57** feature routers + `registerAdminRoutes` + `setupAuth` (which itself adds `/api/login`, `/api/logout`, `/api/user`, etc.). Plus 3 directly-mounted endpoints (Stripe webhook, Razorpay webhook, health) and 2 upload endpoints, 1 client-error sink. Decision rule applied: I treat `tip-management` and `tips` as both registered — the call list includes both `registerTipManagementRoutes` and `registerTipsRoutes` is NOT called (only tip-management); `tips.ts` exists in the routers folder but is not registered in `routes.ts`. Conflict noted in concerns.

## 6. Client pages — surface map

`client/src/pages/` (top-level files + sub-folders):

Auth & onboarding:
- login.tsx, register.tsx, forgot-password.tsx, reset-password.tsx, onboarding.tsx, account.tsx, not-found.tsx

Public guest / kiosk:
- guest.tsx, guest-receipt.tsx, table-qr.tsx, kiosk.tsx

Operator role dashboards (`pages/dashboards/`):
- accountant, delivery-agent, kds-wall, kitchen-board, kitchen-settings, kitchen, manager, owner, service-hub, waiter, wastage-dashboard

Kitchen Display System (`pages/kds/`):
- coordinator

Point of Sale (`pages/pos/`):
- bill-view

Cash (`pages/cash/`):
- index

Tickets (`pages/tickets/`):
- index

Tips (`pages/tips/`):
- report

Menu (`pages/menu/`):
- menu-pricing

Recycle bin:
- recycle-bin.tsx

Operator settings (`pages/settings/`):
- alerts, printer-settings

Procurement (`pages/procurement/`):
- index, purchase-orders, quotations, returns, stock-count, stock-transfers, suppliers

Super-admin console (`pages/admin/`):
- ad-approvals, admins, analytics, audit-log, breach-incidents, dashboard, incident-playbook, security, settings, support-ticket, support, system-health, tenant-detail, tenants, users, vendor-risks

Operator modules (`pages/modules/`) — 60 files:
- access-log, accounting-export, advertisements, audit-log, audits, bi-dashboard, billing, cash-drawer-log, chef-report, cleaning, compliance-report, crm, crockery-breakage-report, customer-requests-analytics, delivery-hub, delivery, events, food-cost-reports, gdpr-rights, hq-console, integrations, inventory-hub, inventory, kiosk-management, live-requests, locations-hub, menu, offers, omnichannel, orders-hub, orders, outlets, parking, pci-compliance, performance, phone-order, pos, price-analysis, procurement, promotions-hub, promotions, qr-request-settings, recipe-editor, reports-hub, reports, security-settings, settings-hub, settings, shift-reconciliation, shifts-management, staff-hub, staff, stock-movement-log, stock-reports, subscription-settings, suppliers, tables, wastage-log, wastage-shift, workforce

## 7. Public surfaces — first pass

Endpoints that appear unauthenticated based on (a) the router file not importing `requireAuth` and/or (b) the handlers having no `requireAuth` middleware in their signature. Verification deferred to Phase 4.

Confirmed public (handler signature has no auth middleware):
- `GET /api/health` (intentional — load balancer)
- `POST /api/stripe/webhook` (HMAC-verified)
- `POST /api/webhooks/razorpay` (HMAC-verified)
- `POST /api/aggregator/webhook/:platform` (channels.ts)
- `POST /api/contact-sales`, `POST /api/contact-support` (contact.ts)
- `POST /api/errors/client`
- All of `/api/guest/*` (guest.ts) — guest QR ordering surface
- All of `/api/kiosk/*` (kiosk.ts) — self-service kiosk surface (kiosk-devices CRUD likely auth-gated)
- `GET /api/qr/restaurant-info`, `GET /api/qr/:token`, `GET /api/qr/table/:token/session`, and adjacent QR table session endpoints (table-requests.ts)
- `POST /api/table-requests` (table-requests.ts) — guest-pressed call/help button
- `GET /api/auth/forgot-password`, `POST /api/auth/forgot-password`, `POST /api/auth/reset-password` (auth.ts) — password reset

Routers that do NOT import `requireAuth` at all (whole-router check):
- `_shared.ts` (helpers only — not a router)
- `channels.ts`, `contact.ts`, `procurement.ts`, `recycle-bin.ts`, `workforce.ts`

Public client entries:
- `/login`, `/register`, `/forgot-password`, `/reset-password`, `/onboarding`
- `/guest`, `/guest-receipt`, `/kiosk`, `/table-qr` (separate `client/qr.html` bundle exists)

This list is INFORMATIONAL. Phase 4 will verify each and check for IDOR/auth-bypass surface.

## 8. Existing audit artifacts

`audit/` already contains a complete prior pass. Filenames only:

Top-level documents:
- 00-repo-map.md
- 03-idor-audit.md, 03-tenancy.md
- 04-money.md, 04-payment-gateway-monetary.md
- 05-auth.md, 05-authorization-enforcement.md
- 06-realtime.md
- 07-external-integrations.md, 07-jobs-integrations.md
- 08-frontend-security.md, 08-frontend.md
- 09-infra-deploy.md
- FINAL-REPORT.md
- FINDINGS.md, OPEN-QUESTIONS.md
- phase-redis-cache-storage.md
- pos-reaudit-findings.md (gitignored per `.gitignore` line 25)

SQL scripts (read-only investigation queries):
- cashier-seed-preflight-2026-04-21.sql
- cashier-users-query-2026-04-21.sql
- f225-day4-audit.sql

Subdirectories:
- 01-inventory/  — endpoints.md, integrations.md, jobs.md, middleware.md, tables.md, websockets.md
- 02-data-flows/ — invoice.md, order-lifecycle.md, payment.md, realtime-sync.md, signup.md
- refactor/ — storage-tenant-isolation-inventory.md

Decision rule applied: per anti-scope-creep, contents NOT read in Phase 0. Phase 1+ should treat these as historical context, not authoritative current findings.

## 9. Build, test, and deploy mechanism

Build (`package.json` scripts + `script/build.ts`)
- Dev (Replit/local): `npm run dev` → `tsx server/index.ts` (server) or `npm run dev:client` → `vite dev --port 5000` (client only).
- Production build: `npm run build` → `tsx script/build.ts` with `NODE_OPTIONS=--max-old-space-size=4096`. Vite builds the SPA into `dist/public/` (two HTML entrypoints: `main` from `client/index.html`, `qr` from `client/qr.html`); the server is bundled to `dist/index.cjs`.
- Production start: `npm start` → `node dist/index.cjs`. Dockerfile `CMD` is `npm start`.

Test
- Unit/integration: `npm test` → `vitest run`. Suite includes ~12 files under `tests/` (HMAC, bill recalc, circuit breaker, tenant assertion, ws tenant bypass, etc.).
- E2E: Playwright config at `playwright.config.ts`; specs at `tests/e2e/` (auth, billing, kitchen, menu, order-management, pos-checkout, staff, support — 8 spec files matching replit.md's stated 33 tests).
- No package script for Playwright is wired (must be invoked via `npx playwright test` or similar).

Database migration strategy
- `package.json`: `"db:push": "drizzle-kit push"` — Drizzle's schema-push (NOT versioned migrate) is the documented dev path.
- `migrations/` directory contains exactly 1 versioned snapshot (`0000_quick_bloodstrike.sql`) plus drizzle's `meta/` journal.
- Boot-time DDL: `server/index.ts` runs many `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` and `ALTER TYPE ... ADD VALUE IF NOT EXISTS` statements directly against the live DB on every app start, plus 6 named runners imported from `server/admin-migrations.ts` (`AdminMigrations`, `Task108Migrations`, `Task184Migrations`, `Task191Migrations`, `P3DeployMigrations`, `ChefAssignmentMigrations`).
- `stripe-replit-sync` runs its own migrations into a separate `stripe` schema if `STRIPE_SECRET_KEY` is set.

Deploy to Railway
- `railway.toml` selects `builder = "dockerfile"`, `restartPolicyType = "on_failure"`, `restartPolicyMaxRetries = 10`.
- `Dockerfile`: 2-stage Node 20-alpine. Stage 1 `npm ci` + `npm run build`. Stage 2 `npm ci --omit=dev`, runs as non-root `appuser`, exposes 5000, healthcheck `wget /api/health`.
- `.replit` is also present for the Replit dev environment (autoscale deploymentTarget) — separate from Railway production.
- Auto-deploy: push to `main` → GitHub → Railway builds and deploys (per project context, no GitHub Actions present in repo root).

## 10. Environment variable inventory

From `.env.example`. Values not reproduced. CRITICAL_FOR_RUNTIME means the app will refuse to start (or boot logic explicitly checks); OPTIONAL means the app starts without it but a feature is disabled.

Application
- NODE_ENV — CRITICAL_FOR_RUNTIME (gates many behaviors)
- PORT — OPTIONAL (defaults to 5000)
- APP_URL — OPTIONAL (default `https://www.inifinit.com` for Stripe webhook URL)
- SESSION_SECRET — CRITICAL_FOR_RUNTIME (`server/index.ts:17` — production refuses to start without it)
- JWT_SECRET — OPTIONAL (referenced in env example)
- JWT_EXPIRES_IN — OPTIONAL

Database
- DATABASE_URL — CRITICAL_FOR_RUNTIME (`drizzle.config.ts:3` throws if missing)
- POSTGRES_USER, POSTGRES_PASSWORD — CRITICAL_FOR_RUNTIME for `docker-compose.yml` only

AWS / S3
- AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET — CRITICAL_FOR_RUNTIME if S3 uploads selected (deferred — file-storage.ts not deep-read)
- AWS_S3_URL — OPTIONAL

Redis
- REDIS_URL — OPTIONAL (required only when running 2+ app instances for WS/rate-limit)

Stripe (international payments)
- STRIPE_SECRET_KEY — OPTIONAL at boot (managed webhook + sync skipped if missing) but CRITICAL_FOR_RUNTIME for paid subscriptions
- STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET — CRITICAL when STRIPE_SECRET_KEY is set

Razorpay (India payments)
- RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET — CRITICAL_FOR_RUNTIME for India tenants

Email (SMTP / SES)
- SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM — CRITICAL for transactional email (deferred verification)

Twilio (SMS / WhatsApp)
- TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER, TWILIO_WHATSAPP_NUMBER — OPTIONAL (no Twilio package found in `dependencies` — concern logged below)

Google
- GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_MAPS_API_KEY — OPTIONAL

Push notifications (VAPID)
- VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_EMAIL — CRITICAL when push subscriptions are used

Cloudinary
- CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET — OPTIONAL (alternative to S3)

OpenAI
- OPENAI_API_KEY — OPTIONAL (no `openai` package found in `dependencies` — concern logged below)

Rate limiting & security
- RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_REQUESTS, BCRYPT_ROUNDS, CORS_ORIGIN — OPTIONAL (have defaults)

Staff defaults
- DEFAULT_STAFF_PASSWORD — CRITICAL_FOR_RUNTIME (`server/index.ts:21` — production refuses to start without it)

Multi-tenant
- DEFAULT_TENANT_ID — OPTIONAL (defaults to 1)
- MAX_LOCATIONS_PER_TENANT — OPTIONAL

Additional (not in `.env.example` but referenced in code or `.replit`):
- ENCRYPTION_KEY — used by `server/encryption.ts` for AES-256-GCM field encryption (see Concerns)
- REPL_ID — Replit-only, gates dev banner/cartographer plugins
- npm_package_version — autoset

## 11. Concerns flagged for later phases

- Secrets-in-source: `.replit` lines 54–57 commit ENCRYPTION_KEY (64-hex-char), VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT under `[userenv.shared]` — defer to Phase 1 secrets review (rotation candidate).
- Env example divergence: `.env.example` lists Twilio and OpenAI variables but the corresponding `twilio` / `openai` packages are absent from `dependencies` — defer to Phase 7 (integrations).
- Migrations strategy: `server/index.ts:392-458` runs raw `ALTER TABLE` / `ALTER TYPE` DDL on every boot and imports 6 ad-hoc "Task* / P3Deploy / ChefAssignment" migration runners from `admin-migrations.ts`, alongside only 1 versioned drizzle SQL file in `migrations/` — defer to Phase 9 (infra/deploy).
- Two lockfiles: `bun.lock` and `package-lock.json` both present at repo root; Dockerfile uses npm — defer to Phase 9 hygiene.
- Dual `tips` routers: `server/routers/tips.ts` and `server/routers/tip-management.ts` both define overlapping `/api/tips/*` paths but only `registerTipManagementRoutes` is wired in `routes.ts` — defer to Phase 1 inventory.
- Schema scale: 179 tables in a single 5,951-line `shared/schema.ts` — defer to Phase 1 inventory for completeness check.
- Unauth router files: `channels.ts`, `contact.ts`, `procurement.ts`, `recycle-bin.ts`, `workforce.ts` do not import `requireAuth` — defer to Phase 4 auth/RBAC verification.
- Wide public surface: `/api/guest/*`, `/api/kiosk/*`, `/api/qr/*`, `/api/aggregator/webhook/:platform`, `/api/table-requests`, `/api/contact-*`, `/api/errors/client` are unauthenticated — defer to Phase 4 IDOR + abuse-rate review.
- Boot-time seeding: `server/index.ts:462-530` runs ~9 seed functions on every boot in production; some create users with `DEFAULT_STAFF_PASSWORD` — defer to Phase 4 (auth) and Phase 9.
- Single `migrations/` snapshot conflicts with `tablesFilter` in `drizzle.config.ts:13-18` (excludes session, modifier_groups, modifier_options, menu_item_modifier_groups) — defer to Phase 1.
- Audit-log immutability: `server/index.ts:574-584` startup assertion only inspects `app._router.stack` for top-level `/api/audit-log` and `/api/audit-events` — Express 5 router internals may have changed (`_router` is private) — defer to Phase 4.
- Top-level scratch files: `B1-kds-recon.md`, `B1b-plan.md`, `M1-recon.md`, `M3-recon.md`, `session-handoff-2026-04-19-*.md`, `check-schema.mjs`, `patch_*.mjs`, `patch_pos_modifiers.py`, `missing_columns.sql`, `customer-requests-panel.png`, `tables-qr-codes-panel.png`, `live-requests-filters.png` clutter repo root — `.gitignore:22-24` covers some patterns but not all already-committed files — defer to Phase 9 hygiene.
- Stray directory: empty directory literally named `D:auditsTable_Saltaudit` at repo root (Windows path-as-name typo) — defer to Phase 9 hygiene.
- Email verification: existing `audit/` already has a phase-redis-cache-storage.md and a pos-reaudit-findings.md outside the numbered phases — defer to Phase 1 to reconcile artifact inventory.
- replit.md vs code: replit.md mentions Twilio SMS OTP and OpenAI features but no SDK is in `dependencies` — defer to Phase 7.
- WebSocket lifecycle: `server/index.ts:734` attaches WS upgrade handler with comment about Replit proxy timing — production is Railway, not Replit — defer to Phase 6 (realtime).
- Express version: `express ^5.0.1` is brand-new (released 2024); some middleware in stack (helmet, express-session, multer, compression) may have known v5 incompatibilities — defer to Phase 9.

## 12. Open questions for the user

1. The `.replit` file commits ENCRYPTION_KEY and VAPID_PRIVATE_KEY values. Are these the same keys used in Railway production, or sandbox-only fakes? If production, these need rotation regardless of the 2026-04-17 history rewrite.
2. `migrations/` has only one drizzle snapshot, yet `server/index.ts` runs ~12 ad-hoc DDL statements and 6 named "Task*" migration runners on every boot. Is the intent to keep boot-time migrations or move to versioned drizzle files? This affects Phase 9 deploy review.
3. Both `server/routers/tips.ts` and `server/routers/tip-management.ts` exist with overlapping route paths, but only `tip-management` is wired. Is `tips.ts` dead code safe to ignore in later phases, or a parallel implementation under cutover?
4. The existing `audit/` folder already contains a full 9-phase audit (e.g. `05-auth.md`, `09-infra-deploy.md`, `FINAL-REPORT.md`). Should this fresh phased audit treat them as historical context, supersede them, or write to a versioned subfolder (e.g. `audit/2026-04-pass2/`)?
5. `.env.example` advertises Twilio and OpenAI integrations but neither SDK is in `package.json` dependencies. Are these features deferred / not yet implemented, or is the integration done via raw HTTP calls elsewhere?

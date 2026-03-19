# Table Salt - Restaurant Management System

## Overview
Table Salt is a multi-tenant SaaS Restaurant Management System designed to streamline restaurant operations. It provides role-based dashboards and comprehensive features including Point of Sale (POS), Kitchen Display System (KDS), menu management, table and inventory management, staff scheduling, offers and discounts, a dine-in payment flow, and advanced reporting. The system aims to enhance efficiency, reduce operational costs, and improve customer satisfaction for restaurants of all sizes. Its robust architecture supports scalability and offers a rich feature set to "Season Your Restaurant Success."

## User Preferences
I prefer detailed explanations and clear communication. Please prioritize iterative development, and ask before making any major architectural changes or significant code refactoring.

## System Architecture
The system employs a modern web architecture. The **frontend** is built with React, TypeScript, Tailwind CSS v4, shadcn/ui for components, wouter for routing, and framer-motion for animations. The chosen theme is "Tropical Paradise," featuring a deep teal sidebar, golden active highlights, mint-tinted backgrounds, and coral/amber accents to provide a distinct user experience.

The **backend** is implemented using Express.js with TypeScript. **PostgreSQL** serves as the database, interfaced via Drizzle ORM. Authentication is handled by Passport.js using a local strategy and session management (connect-pg-simple).

Key technical implementations include:
- **Role-Based Access Control (RBAC)**: `shared/permissions-config.ts` defines role-to-permission mappings, action labels, and supervisor requirements, integrated with backend middleware (`server/permissions.ts`) for granular access control.
- **Multi-currency Support**: `shared/currency.ts` provides locale-aware formatting, static conversion rates, and configurable display options for 24 currencies.
- **Timezone Management**: `client/src/lib/timezones.ts` incorporates 75+ IANA zones with UTC offsets and live clock formatting.
- **Audit Logging**: `server/audit.ts` offers helpers for logging audit events.
- **KDS (Kitchen Display System)**: Supports configurable kitchen stations, automatic assignment of menu item stations/courses to order items, a status flow (pending → cooking → ready → served), and visual cues for elapsed time.
- **Tenant Configuration**: Customizable settings for timezone, currency, tax rates, and service charges.
- **Subscription Tiers & Feature Gating**: Features are dynamically enabled/disabled based on the tenant's subscription plan (Basic, Standard, Premium, Enterprise).
- **Promotion & Pricing Rules Engine**: A flexible engine (`server/promotions-engine.ts`) evaluates rules based on order context, supporting various rule types (e.g., happy hour, combo deals) and discount types, with configurable stacking behavior.
- **Self-Ordering Kiosk**: A dedicated full-screen interface with token-based device authentication, menu browsing, cart management, payment simulation, and upsell rules.
- **Guest QR Table Ordering**: Public web interface (`/guest/o/:outletId/t/:tableToken`) enabling diners to scan a table QR code, browse the menu, add items to a shared cart, place orders (channel: `qr_dinein`), call server, and request bill. Tables have `qrToken`, `callServerFlag`, and `requestBillFlag` columns. Sessions tracked in `table_sessions` table with cart items in `guest_cart_items`.
- **Offline Sync & Idempotency**: `client/src/lib/sync-manager.ts` provides IndexedDB-based offline queue with exponential backoff retry, config caching, and connectivity monitoring. Order creation supports `clientOrderId` for idempotent deduplication (409 on duplicate). `SyncStatusIndicator` component shows online/offline/syncing state in the header.
- **Omnichannel Dashboard**: `/omnichannel` page provides a unified view of order analytics across all channels (POS, Kiosk, QR Table, Online, Aggregators) with revenue mix, order counts, peak hours, and top items per channel.
- **Events & Special Days Calendar**: `/events` page for managing holidays, festivals, sports events, corporate bookings, and promotions. Features month/week/day/list views with color-coded event bars, event CRUD with type, impact level, tags, color, linked offers, and notes. Role-based access: Owner/Manager/Outlet Manager/HQ Admin can create/edit; all roles can view. DB table: `events` with type enum (holiday/festival/sports/corporate/promotion) and impact enum (low/medium/high/very_high).
- **Combo Offers**: Dedicated combo management system in Menu Management with a "Combo Offers" tab. DB table: `combo_offers` with comboPrice, individualTotal, savingsPercentage, mainItems/sideItems/addonItems (jsonb arrays of `{menuItemId, name, price}`), validity dates, timeSlots, outlets, isActive, orderCount. Business rules: comboPrice < individualTotal, savings 5-50%, max 3 sides, max 2 add-ons, unique name per tenant. Full CRUD + duplicate API at `/api/combo-offers`. Auto-deactivation of expired combos. POS integration with "Combos" tab showing active combos, add-to-cart as single line item with component items listed. Seed data includes 3 sample combos.
- **Security Hardening** (`server/security.ts`): Enterprise-grade security middleware including Helmet (X-Frame-Options, X-Content-Type-Options, HSTS, XSS protection, DNS prefetch control, referrer policy, permitted cross-domain policies), Permissions-Policy header, three-tier rate limiting: auth endpoints (15 req/15min per IP), general API (120 req/min per user or IP), and uploads (10 req/min per user). CSRF double-submit cookie pattern protects all mutating API endpoints (login/register/guest/kiosk exempt).
- **Authentication Hardening**: TOTP-based 2FA (setup, verify, disable via `/api/auth/2fa/*`), recovery codes (8 one-time codes), login flow with 2FA challenge step. Password change with policy enforcement (min 8 chars, uppercase/lowercase/digit/special, history reuse prevention, same-password guard). Frontend: 2FA management card and password change card in Security settings, login page with 2FA code input step. Sensitive fields (totpSecret, recoveryCodes, passwordHistory) stripped from all API responses. Deactivated/anonymized accounts blocked at login. Packages: `otpauth`, `qrcode`.
- **Stripe Subscriptions & Trial Management** (`server/stripe.ts`, `client/src/components/billing/trial-banner.tsx`, `client/src/pages/modules/subscription-settings.tsx`): Full SaaS billing loop. New tenants receive a 30-day free trial (Standard tier access, no card required) with `trial_ends_at` and `subscription_status = 'trialing'` set on registration. New DB columns on tenants: `stripe_customer_id`, `stripe_subscription_id`, `trial_ends_at`, `subscription_status`. Backend endpoints: `GET /api/billing/status`, `POST /api/billing/create-checkout-session`, `POST /api/billing/portal`, `POST /api/webhooks/stripe`. Stripe webhook handler syncs plan/status on subscription events (checkout.session.completed, subscription updated/deleted, invoice.payment_failed). Lazy trial expiry check in `/api/billing/status`. Frontend: `TrialBanner` in `AppLayout` (dismissible per day, teal/orange urgency, progress bar), `SubscriptionSettings` page with 4 plan cards (Starter trial, Basic $49/mo, Standard $99/mo, Premium $199/mo), Settings Hub extended with a "Subscription" tab (URL-param aware: `?tab=subscription`). Existing tenants without trial_ends_at automatically set to 'active' in migration. Stripe gracefully optional: all endpoints return 503 when STRIPE_SECRET_KEY not set. Required env vars: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_BASIC`, `STRIPE_PRICE_STANDARD`, `STRIPE_PRICE_PREMIUM`.
- **Enterprise Data Protection** (`server/encryption.ts`, `server/security-alerts.ts`): AES-256-GCM field-level encryption with auto-generated ENCRYPTION_KEY env var. Security alerts system with triggers for brute-force attempts, new IP logins, password changes, 2FA disables, role escalations, and data exports. Alerts stored in `security_alerts` table with severity levels (info/warning/critical), acknowledgment workflow, and unread count badge in sidebar. IP allowlisting with CIDR validation stored in tenant `moduleConfig`. GDPR compliance: personal data export (`/api/gdpr/export`), account anonymization (`/api/gdpr/anonymize-account`), configurable data/audit retention policies. PII suppressed from API response logs on sensitive routes.
- **Super Admin Platform Panel** (`server/admin-routes.ts`): Cross-tenant platform administration. `super_admin` role added to user_role enum (bypasses IP allowlist, gets `redirectTo: '/admin'` on login). Platform tenant (slug: `platform`, id: `74f513e3-9db5-4a9b-b427-6a4c2a6eb082`) houses all super_admin users. Admin API endpoints under `/api/admin/*`: platform stats, tenant CRUD (create/suspend/reactivate), cross-tenant user management (deactivate/reset-password), user impersonation (start/end with session backup), cross-tenant audit log, super admin management. Bootstrap via `POST /api/admin/setup` (one-time) or `scripts/create-super-admin.ts`. Frontend: `/admin` route renders `client/src/pages/admin/index.tsx` with stats and tenant overview (full panel is Task #43).
- **Design System**: Utilizes Outfit and Plus Jakarta Sans fonts, a professional blue primary theme with light/dark mode support, and Framer Motion for UI animations.

## External Dependencies
- **PostgreSQL**: Primary database for all application data.
- **Drizzle ORM**: Used for interacting with the PostgreSQL database.
- **Passport.js**: Authentication middleware.
- **connect-pg-simple**: PostgreSQL-backed session store for Passport.js.
- **React**: Frontend UI library.
- **TypeScript**: Superset of JavaScript for type safety.
- **Tailwind CSS v4**: Utility-first CSS framework for styling.
- **shadcn/ui**: Component library built with Tailwind CSS.
- **wouter**: Small routing library for React.
- **framer-motion**: Animation library for React.
- **TanStack Query**: Data fetching and caching library for React.
- **helmet**: HTTP security headers middleware.
- **express-rate-limit**: Rate limiting middleware for Express.
- **otpauth**: TOTP/HOTP one-time password library for 2FA.
- **qrcode**: QR code generation for 2FA setup.
- **IANA Time Zone Database**: Provides timezone data.

## Navigation Architecture
The sidebar navigation is consolidated from 33 items to 22 using tabbed hub pages. Seven hub pages group related modules:
- **Promotions** (`/promotions`): Offers & Deals + Promotion Rules tabs
- **Inventory** (`/inventory`): Stock & Items + Suppliers + Procurement tabs (Suppliers/Procurement tabs hidden for supervisor role)
- **Staff & Workforce** (`/staff`): Schedule & Staff + Workforce + Performance tabs
- **Reports & Analytics** (`/reports`): Sales Reports + BI & Forecasting + Audit Log tabs
- **Delivery & Online** (`/delivery`): Delivery + Online Orders tabs
- **Locations** (`/outlets`): Outlets + HQ Console tabs (HQ tab restricted to owner/franchise_owner/hq_admin)
- **Settings** (`/settings`): General + Security tabs

Old standalone routes (`/offers`, `/suppliers`, `/procurement`, `/workforce`, `/performance`, `/bi-dashboard`, `/audit-log`, `/orders-hub`, `/hq-console`, `/security`) redirect to their corresponding hub pages.
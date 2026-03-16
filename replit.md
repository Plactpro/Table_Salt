# Table Salt - Restaurant Management System

## Overview
A multi-tenant SaaS Restaurant Management System branded as "Table Salt" (tagline: "Season Your Restaurant Success"). Features role-based dashboards, POS, KDS, menu/table/inventory/staff management, offers & discounts, dine-in payment flow, and reporting.

## Architecture
- **Frontend**: React + TypeScript + Tailwind CSS v4 + shadcn/ui + wouter routing + framer-motion
- **Theme**: Tropical Paradise (deep teal sidebar, golden active highlights, mint-tinted backgrounds, coral/amber accents)
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL + Drizzle ORM
- **Auth**: Passport.js with local strategy, session-based (connect-pg-simple)

## Key Files
- `shared/schema.ts` - Drizzle schema (tenants, users, outlets, menus, orders, tables, inventory, customers, staff, feedback, offers, delivery_orders, employee_performance_logs, sales_inquiries, support_tickets, attendance_logs, cleaning_templates, cleaning_template_items, cleaning_logs, cleaning_schedules, audit_templates, audit_template_items, audit_schedules, audit_responses, audit_issues, recipes, recipe_ingredients, stock_takes, stock_take_lines)
- `shared/currency.ts` - Multi-currency utility (24 currencies, locale-aware formatting, static conversion rates, configurable symbol position & decimal places)
- `client/src/lib/timezones.ts` - Timezone data module (75+ IANA zones with UTC offsets, flag emojis, regions, live clock formatting)
- `server/db.ts` - Database connection (Pool + Drizzle)
- `server/storage.ts` - IStorage interface + DatabaseStorage implementation
- `server/auth.ts` - Passport setup, password hashing, auth middleware
- `server/routes.ts` - All API routes (prefixed /api)
- `server/seed.ts` - Demo data seeder
- `client/src/lib/auth.tsx` - AuthProvider with login/register/logout via TanStack Query, useSubscription hook
- `client/src/lib/subscription.ts` - Subscription tiers, business types, feature gating matrix (includes "offers" feature)
- `client/src/components/widgets/dish-info-panel.tsx` - Reusable DishInfoPanel (ingredients, allergens, nutrition, tags)
- `client/src/App.tsx` - Router with role-based dashboard routing
- `client/src/components/brand/table-salt-logo.tsx` - Reusable Table Salt logo component (full/compact/icon variants)

## User Roles
- **Owner**: Full access, all dashboards and settings
- **Manager**: Outlet management, POS, menu, inventory, staff, reports, offers
- **Waiter**: POS, orders, tables, shift view
- **Kitchen**: KDS (Kitchen Display System), orders
- **Accountant**: Financial dashboard and reports

## Demo Accounts (password: demo123)
- owner / manager / waiter / kitchen / accountant

## Reservation Status Flow
requested → confirmed → seated → completed/no_show (auto-syncs table status)

## Order Status Flow
new → sent_to_kitchen → in_progress → ready → served → ready_to_pay → paid
(Also: cancelled, voided as terminal states)

## Tenant Configuration Fields
- `timezone` (IANA zone, default "UTC"), `timeFormat` ("12hr" / "24hr")
- `currency` (ISO code), `currencyPosition` ("before" / "after"), `currencyDecimals` (0-3)
- `taxRate` (%), `taxType` ("vat" / "gst" / "sales_tax" / "service_tax" / "none"), `compoundTax` (bool)
- `serviceCharge` (%)
- POS uses tenant tax/service charge settings; compound tax applies tax on subtotal+service charge

## Staff Schedule Attendance States
scheduled / present / absent / late

## API Routes
All prefixed with `/api`:
- Auth: `/auth/register`, `/auth/login`, `/auth/logout`, `/auth/me`
- Resources: `/outlets`, `/menu-categories`, `/menu-items`, `/tables`, `/reservations`, `/orders`, `/inventory`, `/customers`, `/users`, `/staff-schedules`
- Offers: `/offers` (CRUD), `/orders-with-offers`
- Delivery: `/delivery-orders` (CRUD)
- Performance: `/performance-logs` (CRUD)
- CRM: `/customers/by-loyalty/:tier`, `/customers/by-tag/:tag`
- Attendance: `/attendance` (GET, role-scoped), `/attendance/status` (GET), `/attendance/clock-in` (POST), `/attendance/clock-out` (POST)
- Cleaning: `/cleaning/templates` (CRUD), `/cleaning/templates/:id/items` (GET), `/cleaning/logs` (GET/POST/DELETE)
- Contact: `/contact-config` (GET, public), `/contact-sales` (POST, public), `/contact-support` (POST, public)
- Recipes: `/recipes` (CRUD with ingredients), `/food-cost-report` (GET)
- Stock Takes: `/stock-takes` (GET/POST), `/stock-takes/:id` (GET), `/stock-takes/:id/lines/:lineId` (PATCH), `/stock-takes/:id/complete` (PATCH)
- Stock Movements: `/stock-movements` (GET with limit)
- Dashboard: `/dashboard`, `/reports/sales`, `/tenant`

## Frontend Pages
- `/login`, `/register` - Auth pages
- `/` - Role-based dashboard (owner/manager/waiter/kitchen/accountant)
- `/pos` - Point of Sale (with offer integration)
- `/orders` - Order management (with Ready to Pay status, bill preview)
- `/tables` - Table floor plan & reservations
- `/menu` - Menu management (with image, tags, ingredients, DishInfoPanel)
- `/inventory` - Inventory & Recipe Costing (4 tabs: Inventory items, Recipes with ingredient picker & live cost calc, Stock Takes with variance, Food Cost report)
- `/staff` - Staff management (roster, schedule, attendance tabs with clock-in/out tracking)
- `/reports` - Sales reports
- `/offers` - Offers & Discounts management (premium+ tier, combo/BOGO/free_item marked as POS N/A)
- `/billing` - Subscription plans + Invoice history (service charge line in dine-in invoices)
- `/crm` - Customer Relationship Management (profiles, loyalty tiers, tags, order history)
- `/performance` - Employee performance tracking (metrics logs, staff overview)
- `/delivery` - Delivery order management (status flow, driver info, fee display)
- `/cleaning` - Cleaning & Maintenance schedules (Kitchen, Premises, Deep Clean tabs + Compliance reporting)
- `/audits` - Internal Audits (Dashboard, Schedules, Templates, Issues, Analytics tabs with audit execution flow)
- `/integrations` - Third-party integration management
- `/settings` - Tenant settings

## Subscription Tiers & Feature Gating
- **Basic**: orders, menu, settings
- **Standard**: + tables, pos, inventory, staff, outlets, reservations, cleaning
- **Premium**: + reports, billing, analytics, delivery, loyalty, crm, offers, cleaning, internal_audits
- **Enterprise**: + integrations, multi-location, api_access, custom_branding, internal_audits


## Contact Sales & Support
- **Contact Sales**: Gold floating button (bottom-right), appears ONLY on `/billing` page. Opens inquiry form with business details, subscription interest, demo request.
- **Contact Support**: Headset icon in header (all pages, global). Opens quick support form with issue type, urgency, description. Auto-populates user/tenant context. Returns ticket reference number (SUP-XXXX).
- **Email**: Stub implementation (logs to console). Configure SMTP via `SALES_EMAIL`, `SUPPORT_EMAIL`, `ENABLE_CONTACT_SALES`, `ENABLE_CONTACT_SUPPORT` env vars.
- **DB tables**: `sales_inquiries`, `support_tickets`
- **Mobile**: Support FAB (cyan, bottom-right), Sales FAB on billing page stacks above it.

## Design System
- Fonts: Outfit (headings), Plus Jakarta Sans (body)
- Theme: Professional blue primary with light/dark mode support
- Animations: Framer Motion for entrance animations on dashboard widgets

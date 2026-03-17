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
- `shared/schema.ts` - Drizzle schema (tenants, users, outlets, menus, orders, table_zones, tables, waitlist_entries, inventory, customers, staff, feedback, offers, delivery_orders, employee_performance_logs, sales_inquiries, support_tickets, attendance_logs, cleaning_templates, cleaning_template_items, cleaning_logs, cleaning_schedules, audit_templates, audit_template_items, audit_schedules, audit_responses, audit_issues, recipes, recipe_ingredients, stock_takes, stock_take_lines, kitchen_stations, regions, franchise_invoices, outlet_menu_overrides, suppliers, supplier_catalog_items, purchase_orders, purchase_order_items, goods_received_notes, grn_items, procurement_approvals, labour_cost_snapshots, audit_events, device_sessions)
- `shared/currency.ts` - Multi-currency utility (24 currencies, locale-aware formatting, static conversion rates, configurable symbol position & decimal places)
- `client/src/lib/timezones.ts` - Timezone data module (75+ IANA zones with UTC offsets, flag emojis, regions, live clock formatting)
- `server/db.ts` - Database connection (Pool + Drizzle)
- `server/storage.ts` - IStorage interface + DatabaseStorage implementation
- `server/auth.ts` - Passport setup, password hashing, auth middleware
- `server/permissions.ts` - RBAC permission map, `can()`, `needsSupervisorApproval()` helpers
- `server/audit.ts` - `auditLog()` / `auditLogFromReq()` audit event logging helpers
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

## KDS (Kitchen Display System)
- **Kitchen Stations**: grill, main, fryer, cold, pastry, bar (configurable per tenant)
- **Menu items** have `station` and `course` fields → auto-copied to order items on creation
- **Order item status flow**: pending → cooking → ready → served (with recall: ready → cooking)
- **Order-level sync**: When all items are ready, order moves to "ready"; when any item starts cooking, order moves to "in_progress"; recall downgrades order from "ready" to "in_progress"
- **Elapsed time color coding**: green (<5min), orange (5-10min), red (>10min) with flashing for late tickets
- **Station filtering**: KDS UI can filter by station to show only relevant items
- **Course grouping**: Items grouped by course (starter/main/dessert/beverage) within tickets
- **API endpoints**: `/api/kitchen-stations` (CRUD), `/api/kds/tickets` (GET), `/api/kds/order-items/:id/status` (PATCH), `/api/kds/orders/:id/items-status` (bulk PATCH)
- **Access control**: KDS mutations restricted to owner/manager/kitchen roles

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
- Resources: `/outlets`, `/menu-categories`, `/menu-items`, `/table-zones` (CRUD), `/tables` (CRUD + `/seat`, `/clear`, `/merge`, `/unmerge`), `/waitlist` (CRUD + `/seat`), `/table-analytics`, `/reservations`, `/orders`, `/inventory`, `/customers`, `/users`, `/staff-schedules`
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
- Suppliers: `/suppliers` (CRUD), `/suppliers/:id/catalog` (GET)
- Supplier Catalog: `/supplier-catalog-items` (POST/DELETE)
- Purchase Orders: `/purchase-orders` (GET/POST), `/purchase-orders/:id` (GET with items/GRNs/approvals), `/purchase-orders/:id/approve` (POST), `/purchase-orders/:id/send` (POST)
- GRNs: `/grns` (POST with auto inventory update + stock movements + PO status transition)
- Procurement Analytics: `/procurement/analytics` (spend by supplier/item, price variances), `/procurement/low-stock` (suggested reorder quantities)
- Workforce: `/workforce/dashboard` (GET with period=day|week|month, KPIs+byRole+byOutlet+byDay+byHour), `/workforce/timesheet` (GET), `/workforce/timesheet/csv` (GET, CSV export), `/workforce/alerts` (GET, threshold alerts), `/workforce/snapshots` (GET/POST generate daily snapshots), `/workforce/settings` (PATCH, owner-only)
- BI Dashboards: `/reports/operations` (hourly sales, channel mix, heatmap, top items), `/reports/finance` (net sales, tax, discounts, voids, food/labour cost %, gross margin, daily breakdown), `/reports/marketing` (loyalty enrollments, tier distribution, campaigns, ratings), `/reports/forecast` (weekly moving-average forecast + production suggestions)
- Security & Audit: `/permissions` (GET role permissions), `/permissions/check` (POST check action), `/supervisor/verify` (POST supervisor override), `/supervisor/otp-challenge` (POST), `/supervisor/otp-verify` (POST), `/audit-log` (GET with filters, `/entity/:type/:id`, `/export/csv`, `/actions`), `/security/settings` (GET/PATCH), `/device-sessions` (CRUD + `/trust`), `/users/:id/role` (PATCH with audit)
- Dashboard: `/dashboard`, `/reports/sales`, `/tenant`

## Frontend Pages
- `/login`, `/register` - Auth pages
- `/` - Role-based dashboard (owner/manager/waiter/kitchen/accountant)
- `/pos` - Point of Sale (with offer integration)
- `/orders` - Order management (with Ready to Pay status, bill preview)
- `/tables` - Advanced Table & Queue Management (floor plan with zone grouping, party seating/clearing, table merging/unmerging, waitlist queue, weekly reservation calendar, zone management with colors, real-time analytics)
- `/menu` - Menu management (with image, tags, ingredients, DishInfoPanel)
- `/inventory` - Inventory & Recipe Costing (4 tabs: Inventory items, Recipes with ingredient picker & live cost calc, Stock Takes with variance, Food Cost report)
- `/staff` - Staff management (roster, schedule, attendance tabs with clock-in/out tracking)
- `/reports` - Sales reports
- `/bi-dashboard` - BI Dashboards & Forecasting (Operations: hourly sales, heatmap, channel mix, top dishes; Finance: P&L, margins, cost breakdown; Marketing: loyalty, campaigns, ratings; Forecasting: weekly moving-average + production suggestions)
- `/offers` - Offers & Discounts management (premium+ tier, combo/BOGO/free_item marked as POS N/A)
- `/billing` - Subscription plans + Invoice history (service charge line in dine-in invoices)
- `/crm` - Customer Relationship Management (profiles, loyalty tiers, tags, order history)
- `/performance` - Employee performance tracking (metrics logs, staff overview)
- `/delivery` - Delivery order management (status flow, driver info, fee display)
- `/cleaning` - Cleaning & Maintenance schedules (Kitchen, Premises, Deep Clean tabs + Compliance reporting)
- `/audits` - Internal Audits (Dashboard, Schedules, Templates, Issues, Analytics tabs with audit execution flow)
- `/orders-hub` - Online Orders / Aggregator Hub (Talabat, Deliveroo, Careem, Noon Food)
- `/hq-console` - HQ Console (multi-outlet KPIs, outlet comparison, franchise royalty calculator/invoices, menu overrides, region management)
- `/suppliers` - Supplier Management (supplier list, detail view, product catalogs per supplier)
- `/procurement` - Procurement (PO lifecycle: draft→approved→sent→partially_received→closed, GRN with auto inventory update, analytics with spend-by-supplier/item, price variances, low-stock alerts)
- `/workforce` - Workforce & Labour Cost (KPI dashboard with labour %, sales/labour hr, overtime tracking; cost breakdown by role/outlet/day; timesheet with CSV export; configurable target alerts)
- `/integrations` - Third-party integration management
- `/settings` - Tenant settings
- `/audit-log` - Audit Log (filterable event timeline, action/user/entity filters, date range, before/after diffs, CSV export, event detail dialog)
- `/security-settings` - Security & Governance (session controls, supervisor approval toggles for void/discount/price/stock, role-permission matrix with 32 permissions across 5 roles, trusted device management, OTP challenge/verify simulation)

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

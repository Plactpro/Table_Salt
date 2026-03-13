# ServeOS - Restaurant Management System

## Overview
A multi-tenant SaaS Restaurant Management System with role-based dashboards, POS, KDS, menu/table/inventory/staff management, offers & discounts, dine-in payment flow, and reporting.

## Architecture
- **Frontend**: React + TypeScript + Tailwind CSS v4 + shadcn/ui + wouter routing + framer-motion
- **Theme**: Tropical Paradise (deep teal sidebar, golden active highlights, mint-tinted backgrounds, coral/amber accents)
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL + Drizzle ORM
- **Auth**: Passport.js with local strategy, session-based (connect-pg-simple)

## Key Files
- `shared/schema.ts` - Drizzle schema (tenants, users, outlets, menus, orders, tables, inventory, customers, staff, feedback, offers, delivery_orders, employee_performance_logs)
- `shared/currency.ts` - Multi-currency utility (24 currencies, locale-aware formatting, static conversion rates)
- `server/db.ts` - Database connection (Pool + Drizzle)
- `server/storage.ts` - IStorage interface + DatabaseStorage implementation
- `server/auth.ts` - Passport setup, password hashing, auth middleware
- `server/routes.ts` - All API routes (prefixed /api)
- `server/seed.ts` - Demo data seeder
- `client/src/lib/auth.tsx` - AuthProvider with login/register/logout via TanStack Query, useSubscription hook
- `client/src/lib/subscription.ts` - Subscription tiers, business types, feature gating matrix (includes "offers" feature)
- `client/src/components/widgets/dish-info-panel.tsx` - Reusable DishInfoPanel (ingredients, allergens, nutrition, tags)
- `client/src/App.tsx` - Router with role-based dashboard routing

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
- Dashboard: `/dashboard`, `/reports/sales`, `/tenant`

## Frontend Pages
- `/login`, `/register` - Auth pages
- `/` - Role-based dashboard (owner/manager/waiter/kitchen/accountant)
- `/pos` - Point of Sale (with offer integration)
- `/orders` - Order management (with Ready to Pay status, bill preview)
- `/tables` - Table floor plan & reservations
- `/menu` - Menu management (with image, tags, ingredients, DishInfoPanel)
- `/inventory` - Inventory management
- `/staff` - Staff management
- `/reports` - Sales reports
- `/offers` - Offers & Discounts management (premium+ tier, combo/BOGO/free_item marked as POS N/A)
- `/billing` - Subscription plans + Invoice history (service charge line in dine-in invoices)
- `/crm` - Customer Relationship Management (profiles, loyalty tiers, tags, order history)
- `/performance` - Employee performance tracking (metrics logs, staff overview)
- `/delivery` - Delivery order management (status flow, driver info, fee display)
- `/integrations` - Third-party integration management
- `/settings` - Tenant settings

## Subscription Tiers & Feature Gating
- **Basic**: orders, menu, settings
- **Standard**: + tables, pos, inventory, staff, outlets, reservations
- **Premium**: + reports, billing, analytics, delivery, loyalty, crm, offers
- **Enterprise**: + integrations, multi-location, api_access, custom_branding

## Design System
- Fonts: Outfit (headings), Plus Jakarta Sans (body)
- Theme: Professional blue primary with light/dark mode support
- Animations: Framer Motion for entrance animations on dashboard widgets

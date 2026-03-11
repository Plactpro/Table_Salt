# ServeOS - Restaurant Management System

## Overview
A multi-tenant SaaS Restaurant Management System with role-based dashboards, business-type customization (Enterprise, QSR, Food Truck, Cafe, Fine Dining, Casual Dining, Cloud Kitchen), subscription-gated features (Basic/Standard/Premium/Enterprise), POS, KDS, menu/table/inventory/staff management, and reporting.

## Architecture
- **Frontend**: React + TypeScript + Tailwind CSS v4 + shadcn/ui + wouter routing + framer-motion
- **Theme**: Tropical Beach (aqua-to-sand sidebar gradient, glass-morphism nav pills, teal primary, coral accents)
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL + Drizzle ORM
- **Auth**: Passport.js with local strategy, session-based (connect-pg-simple)

## Business Types
- Enterprise (Multi-location chains)
- QSR (Quick Service Restaurants)
- Food Truck (Mobile operations)
- Cafe (Coffee/tea shops)
- Fine Dining (High-end restaurants)
- Casual Dining (Family restaurants)
- Cloud Kitchen (Delivery-only)

## Subscription Tiers
- **Basic** (Free): Orders, Menu, Settings
- **Standard** ($29/mo): + Tables, POS, Inventory, Staff, Outlets, Reservations
- **Premium** ($79/mo): + Reports, Billing, Advanced Analytics, Delivery, Loyalty, CRM
- **Enterprise** ($199/mo): + Integrations, API Access, Custom Branding, Multi-Location

## Key Files
- `shared/schema.ts` - Drizzle schema (tenants with plan + businessType, users, outlets, menus, orders, tables, inventory, customers, staff, feedback)
- `server/db.ts` - Database connection (Pool + Drizzle)
- `server/storage.ts` - IStorage interface + DatabaseStorage implementation
- `server/auth.ts` - Passport setup, password hashing, auth middleware
- `server/routes.ts` - All API routes (prefixed /api); /api/auth/me returns tenant info (plan, businessType)
- `server/seed.ts` - Demo data seeder (The Grand Kitchen = fine_dining, premium plan)
- `client/src/lib/auth.tsx` - AuthProvider with login/register/logout, tenant context, useSubscription() hook
- `client/src/lib/subscription.ts` - Subscription matrix, business configs, feature gating logic, badge generation
- `client/src/App.tsx` - Router with role-based dashboard routing
- `client/src/components/layout/sidebar.tsx` - Beach-themed sidebar with water/sand gradient, subscription gating (lock icons), business badges in sand area

## User Roles
- **Owner**: Full access, all dashboards and settings
- **Manager**: Outlet management, POS, menu, inventory, staff, reports
- **Waiter**: POS, orders, tables, shift view
- **Kitchen**: KDS (Kitchen Display System), orders
- **Accountant**: Financial dashboard and reports

## Demo Accounts (password: demo123)
- owner / manager / waiter / kitchen / accountant

## API Routes
All prefixed with `/api`:
- Auth: `/auth/register`, `/auth/login`, `/auth/logout`, `/auth/me` (includes tenant plan + businessType)
- Resources: `/outlets`, `/menu-categories`, `/menu-items`, `/tables`, `/reservations`, `/orders`, `/inventory`, `/customers`, `/users`, `/staff-schedules`
- Dashboard: `/dashboard`, `/reports/sales`, `/tenant` (GET + PATCH for plan/businessType changes)

## Frontend Pages
- `/login`, `/register` - Auth pages
- `/` - Role-based dashboard (owner/manager/waiter/kitchen/accountant) with business-type-specific KPIs
- `/pos` - Point of Sale
- `/orders` - Order management
- `/tables` - Table floor plan & reservations
- `/menu` - Menu management
- `/inventory` - Inventory management
- `/staff` - Staff management
- `/reports` - Sales reports
- `/outlets` - Multi-outlet management (business-type-specific views)
- `/billing` - Subscription plan display & upgrade CTAs
- `/integrations` - Third-party integration management
- `/settings` - Tenant settings (includes business type & plan selectors)

## Design System
- Fonts: Outfit (headings), Plus Jakarta Sans (body)
- Theme: Tropical Beach — aqua water gradient sidebar top, sand bottom, teal primary buttons, coral/amber stat accents
- Sidebar: Glass-morphism nav pills, dark teal text, lock overlays on gated features, business badges in sand area
- Animations: Framer Motion for entrance animations, water shimmer effects in sidebar

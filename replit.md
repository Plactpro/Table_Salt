# ServeOS - Restaurant Management System

## Overview
A multi-tenant SaaS Restaurant Management System with role-based dashboards, POS, KDS, menu/table/inventory/staff management, and reporting.

## Architecture
- **Frontend**: React + TypeScript + Tailwind CSS v4 + shadcn/ui + wouter routing + framer-motion
- **Theme**: Tropical Paradise (deep teal sidebar, golden active highlights, mint-tinted backgrounds, coral/amber accents)
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL + Drizzle ORM
- **Auth**: Passport.js with local strategy, session-based (connect-pg-simple)

## Key Files
- `shared/schema.ts` - Drizzle schema definitions (tenants, users, outlets, menus, orders, tables, inventory, customers, staff, feedback)
- `server/db.ts` - Database connection (Pool + Drizzle)
- `server/storage.ts` - IStorage interface + DatabaseStorage implementation
- `server/auth.ts` - Passport setup, password hashing, auth middleware
- `server/routes.ts` - All API routes (prefixed /api)
- `server/seed.ts` - Demo data seeder
- `client/src/lib/auth.tsx` - AuthProvider with login/register/logout via TanStack Query, useSubscription hook
- `client/src/lib/subscription.ts` - Subscription tiers, business types, feature gating matrix
- `client/src/App.tsx` - Router with role-based dashboard routing
- `client/src/pages/modules/outlets.tsx` - Multi-location outlet management
- `client/src/pages/modules/billing.tsx` - Subscription plan management
- `client/src/pages/modules/integrations.tsx` - Third-party integration management

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
- Auth: `/auth/register`, `/auth/login`, `/auth/logout`, `/auth/me`
- Resources: `/outlets`, `/menu-categories`, `/menu-items`, `/tables`, `/reservations`, `/orders`, `/inventory`, `/customers`, `/users`, `/staff-schedules`
- Dashboard: `/dashboard`, `/reports/sales`, `/tenant`

## Frontend Pages
- `/login`, `/register` - Auth pages
- `/` - Role-based dashboard (owner/manager/waiter/kitchen/accountant)
- `/pos` - Point of Sale
- `/orders` - Order management
- `/tables` - Table floor plan & reservations
- `/menu` - Menu management
- `/inventory` - Inventory management
- `/staff` - Staff management
- `/reports` - Sales reports
- `/settings` - Tenant settings

## Design System
- Fonts: Outfit (headings), Plus Jakarta Sans (body)
- Theme: Professional blue primary with light/dark mode support
- Animations: Framer Motion for entrance animations on dashboard widgets
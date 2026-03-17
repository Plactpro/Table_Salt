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
- **IANA Time Zone Database**: Provides timezone data.
# Table Salt - Restaurant Management System

## Overview
Table Salt is a multi-tenant SaaS Restaurant Management System designed to streamline restaurant operations. It offers role-based dashboards and a comprehensive suite of features including Point of Sale (POS), Kitchen Display System (KDS), menu, table, and inventory management, staff scheduling, offers, discounts, a dine-in payment flow, and advanced reporting. The system aims to enhance efficiency, reduce operational costs, and improve customer satisfaction for restaurants, supporting scalability and a rich feature set to "Season Your Restaurant Success."

## User Preferences
I prefer detailed explanations and clear communication. Please prioritize iterative development, and ask before making any major architectural changes or significant code refactoring.

## System Architecture
The system employs a modern web architecture with a React-based frontend and an Express.js backend, using PostgreSQL via Drizzle ORM. Authentication is handled by Passport.js.

### Frontend
- **Frameworks**: React, TypeScript, Tailwind CSS v4, shadcn/ui, wouter, framer-motion.
- **UI/UX**: "Tropical Paradise" theme (deep teal, golden highlights, mint backgrounds, coral/amber accents). Outfit and Plus Jakarta Sans fonts, professional blue primary theme with light/dark mode.
- **Performance**: Code splitting with `React.lazy()`, lazy image loading.

### Backend
- **Framework**: Express.js with TypeScript.
- **Database**: PostgreSQL with Drizzle ORM.
- **Authentication**: Passport.js (local strategy, session management via connect-pg-simple), TOTP-based 2FA, robust password policies, sensitive field stripping.
- **Core Features**:
    - **Role-Based Access Control (RBAC)**: Granular permissions.
    - **Multi-currency & Timezone Support**: Locale-aware formatting for 24 currencies and 75+ IANA time zones.
    - **Audit Logging**: System for tracking important events.
    - **Kitchen Display System (KDS)**: Configurable stations, status flow, visual cues, recipe card integration with stock checks, wastage reporting, chef station selection. Includes selective item cooking control with per-item lifecycle management, timing engine for staggered cooking, and course-based firing.
    - **Inventory & Stock Management**: Stock movement log with full audit trail, chef accountability reports, shift reconciliation reports.
    - **Restaurant Billing & POS Session**: Full billing flow with multi-method payments, tips, change calculation, receipt printing/WhatsApp. POS session open/close with cash float reconciliation.
    - **CRM Integration**: Customer lookup at POS checkout, loyalty integration, visit tracking, birthday/anniversary banners.
    - **Tenant Configuration**: Customizable settings for timezone, currency, tax, service charges.
    - **Subscription Management**: Tiered subscription plans with feature gating, Stripe integration for billing and trial management.
    - **Promotion & Pricing Rules Engine**: Flexible engine for discounts and stacking.
    - **Self-Ordering Kiosk & Guest QR Table Ordering**: Public interfaces for customer ordering, payment simulation, and server requests.
    - **Offline Sync**: IndexedDB-based offline queue with retry, config caching, and connectivity monitoring.
    - **Omnichannel Dashboard**: Unified analytics across all order channels.
    - **Events & Special Days Calendar**: Management of holidays and promotions.
    - **Combo Offers**: System for bundled menu items.
    - **Security Hardening**: Helmet, Permissions-Policy, three-tier rate limiting, CSRF protection, AES-256-GCM field-level encryption, IP allowlisting, GDPR compliance.
    - **Real-time WebSocket Push**: Replaced HTTP polling for real-time updates in KDS, POS, and Tables.
    - **Shifts Management**: Configurable work shifts with templates and auto-detection for stock movement tagging.
    - **Print Infrastructure**: Queued KOT/bill/receipt print jobs per tenant, configurable per-station `printerUrl`, print queue panel.
    - **Super Admin Panel**: Cross-tenant administration, tenant/user management, impersonation, audit logs.
    - **Smart Chef Assignment & Counter Management**: Kitchen counter management, intelligent chef assignment engine with multiple modes, live manager analytics, chef check-in, and KDS Wall integration.
    - **Phone/Advance Order Entry**: Staff page for manual order entry, CRM lookup, order types (Takeaway/Delivery/Advance/Dine-in), scheduling, special instructions. Includes an auto-release scheduler for advance orders.
    - **Enhanced Delivery Coordination Panel**: Kanban view for delivery orders (Preparing/Ready/Out for Delivery), live KPIs, delivery agent management, platform icon integration.
    - **In-App Support Ticket System**: Floating support widget for creating and viewing tickets, real-time reply notifications, and an admin support console with management and impersonation features.
- **API**: Comprehensive RESTful API endpoints for all features, including webhook stubs for external delivery platforms.
- **Performance**: `compression` middleware for response compression, covering database indexes on critical tables.

### Navigation Architecture
- Consolidated sidebar navigation with 25 items across 7 hub pages (Promotions, Inventory, Staff & Workforce, Reports & Analytics, Delivery & Online, Locations, Settings).

### E2E Test Suite
- **Playwright**: 33 tests across 8 spec files covering critical user flows (auth, billing, kitchen, menu, order management, POS checkout, staff, support). Utilizes session cookie caching and robust navigation waiting.

### Parking Management System
- **Database**: 9 dedicated tables (`parking_layout_config`, `parking_zones`, `parking_slots`, `parking_rates`, `parking_rate_slabs`, `valet_staff`, `valet_tickets`, `valet_ticket_events`, `valet_retrieval_requests`, `bill_parking_charges`).
- **Logic**: Storage layer, charge service supporting various billing modes (FLAT/HOURLY/SLAB) with free minutes, validation discounts, and daily caps.
- **Integration**: API router for CRUD operations, automatic billing integration with valet tickets.
- **Alerts**: `PARKING_FULL` and `PARKING_RETRIEVAL_REQUESTED` alerts.
- **Ticket Numbers**: Formatted `VT-YYYYMMDD-NNNN`.
- **Visual Floor Plan**: Slot Board supports two modes — List (grid) and Floor Plan (drag-and-drop canvas). Positions saved via PATCH to slot endpoint (posX/posY). Auto-defaults to Floor Plan for ≥10 slots.
- **Zone Utilization Heatmap**: Dashboard shows horizontal bar chart per zone with color coding (green <70%, amber 70–90%, red ≥90%/full).
- **Smart Auto-Assign**: `GET /api/parking/auto-assign?outletId=X&vehicleType=Y` returns best available slot based on vehicle suitability and position proximity. Surfaced as "Auto-Assign" button in check-in dialog Step 2.
- **Enhanced Analytics**: `GET /api/parking/analytics/:outletId?from=&to=` returns peak hours, revenue by vehicle type, revenue by zone, avg duration trend. Revenue tab shows bar charts, donut-style breakdowns and Analytics/History sub-tabs.
- **Operations Search**: Real-time client-side filter in Operations tab by ticket #, plate, customer name, table assignment.

## External Dependencies
- **PostgreSQL**: Primary database.
- **Drizzle ORM**: Database interaction.
- **Passport.js**: Authentication.
- **connect-pg-simple**: PostgreSQL session store.
- **React**: Frontend UI library.
- **TypeScript**: Type safety.
- **Tailwind CSS v4**: Styling framework.
- **shadcn/ui**: UI component library.
- **wouter**: React routing library.
- **framer-motion**: Animation library.
- **TanStack Query**: Data fetching and caching.
- **helmet**: HTTP security headers.
- **express-rate-limit**: Rate limiting.
- **otpauth**: TOTP/HOTP library for 2FA.
- **qrcode**: QR code generation.
- **IANA Time Zone Database**: Timezone data.
- **Stripe**: Payment gateway for subscriptions and order payments.
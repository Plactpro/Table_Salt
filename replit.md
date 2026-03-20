# Table Salt - Restaurant Management System

## Overview
Table Salt is a multi-tenant SaaS Restaurant Management System designed to streamline restaurant operations. It offers role-based dashboards and a comprehensive suite of features including Point of Sale (POS), Kitchen Display System (KDS), menu, table, and inventory management, staff scheduling, offers, discounts, a dine-in payment flow, and advanced reporting. The system's purpose is to enhance efficiency, reduce operational costs, and improve customer satisfaction for restaurants, supporting scalability and a rich feature set to "Season Your Restaurant Success."

## User Preferences
I prefer detailed explanations and clear communication. Please prioritize iterative development, and ask before making any major architectural changes or significant code refactoring.

## System Architecture
The system employs a modern web architecture with a React-based frontend and an Express.js backend, using PostgreSQL via Drizzle ORM. Authentication is handled by Passport.js.

### Frontend
- **Frameworks**: React, TypeScript, Tailwind CSS v4, shadcn/ui (components), wouter (routing), framer-motion (animations).
- **UI/UX**: "Tropical Paradise" theme with a deep teal sidebar, golden active highlights, mint-tinted backgrounds, and coral/amber accents. Outfit and Plus Jakarta Sans fonts, professional blue primary theme with light/dark mode.

### Backend
- **Framework**: Express.js with TypeScript.
- **Database**: PostgreSQL with Drizzle ORM.
- **Authentication**: Passport.js with local strategy and session management (connect-pg-simple).
- **Core Features**:
    - **Role-Based Access Control (RBAC)**: Granular permissions integrated with middleware.
    - **Multi-currency Support**: Locale-aware formatting for 24 currencies.
    - **Timezone Management**: Integration of 75+ IANA zones.
    - **Audit Logging**: System for tracking important events.
    - **KDS (Kitchen Display System)**: Configurable stations, status flow, visual cues. Recipe Card drawer with ingredient stock pre-check (green/amber/red badges), stock deduction on START (POS-only, kiosk deducts at payment), wastage reporting modal, chef station selector persisted in localStorage, KIOSK badge on tickets. KOT event logging (`/api/kot-events`) with chef/station/shift attribution on every cook-start.
    - **Stock Movement Log**: Full audit trail at `/inventory → Movements` with filters by date, chef, station, type, ingredient, shift. Summary cards for consumed today, wastage, alerts, and active chef.
    - **Chef Accountability Report**: Chef cards with dish count, consumed value, wastage, ingredient breakdown per chef — at `/reports → Chef Report`.
    - **Shifts Management**: Create/edit/delete kitchen shifts (Morning/Evening/Night) with active-shift tagging on all stock movements — at `/settings → Shifts`.
    - **Shift Reconciliation Report**: Per-shift revenue, consumption, and wastage breakdown by ingredient and chef — at `/reports → Shift Reconciliation`.
    - **Restaurant Billing + POS Session**: Full billing flow: bill preview, multi-method payment (Cash/Card/UPI/Loyalty/Split), tips, change-due calculator, receipt print/WhatsApp. POS session open/close with cash float reconciliation and shift reports. Tables: `bills`, `bill_payments`, `pos_sessions`.
    - **Tenant Configuration**: Customizable settings for timezone, currency, tax, and service charges.
    - **Subscription Tiers & Feature Gating**: Dynamic feature access based on subscription plans (Basic, Standard, Premium, Enterprise).
    - **Promotion & Pricing Rules Engine**: Flexible engine for various discount types and stacking behavior.
    - **Self-Ordering Kiosk**: Full-screen interface with token-based authentication, menu, cart, payment simulation, and upsells.
    - **Guest QR Table Ordering**: Public web interface for diners to order, call server, and request bill via QR codes.
    - **Offline Sync & Idempotency**: IndexedDB-based offline queue with retry, config caching, and connectivity monitoring.
    - **Omnichannel Dashboard**: Unified analytics across all order channels (POS, Kiosk, QR Table, Online, Aggregators).
    - **Events & Special Days Calendar**: Management of holidays, festivals, and promotions with CRUD functionality and role-based access.
    - **Combo Offers**: Dedicated system for managing bundled menu items with specific pricing rules and POS integration.
    - **Security Hardening**: Enterprise-grade middleware including Helmet, Permissions-Policy, three-tier rate limiting, and CSRF protection.
    - **Authentication Hardening**: TOTP-based 2FA, recovery codes, robust password policies, and sensitive field stripping.
    - **Stripe Subscriptions & Trial Management**: Full SaaS billing loop with 30-day free trial, webhook integration, and subscription settings UI.
    - **Stripe Order Payments**: Real card payments integrated into Kiosk, Guest, and POS ordering flows via Stripe Checkout sessions and webhooks.
    - **Enterprise Data Protection**: AES-256-GCM field-level encryption, security alerts system, IP allowlisting, and GDPR compliance features (export, anonymization, retention policies).
    - **Real-time WebSocket Push**: Replaced HTTP polling in KDS, POS, and Tables with persistent WebSocket connections for real-time updates.
    - **Shifts Management**: Configurable work shifts (Morning/Evening/Night with time ranges) with active/inactive toggle, preset templates, auto-detection for tagging stock movements. Found under Settings → Shifts tab.
    - **Stock Movement Log**: Full audit trail of inventory deductions and wastage with filters (date, chef, station, type, ingredient, shift). Summary cards for daily consumption, wastage, alerts, active chef. Found under Inventory → Movements tab.
    - **Chef Accountability Report**: Per-chef breakdown of consumption value, wastage, order count, and ingredient usage. Found under Reports → Chef Report tab.
    - **Shift Reconciliation Report**: Per-shift stock movement summary (consumption vs wastage) with expandable detail rows, ingredient and station breakdowns. Found under Reports → Shift Report tab.
    - **KOT Events**: Audit log table tracking kitchen order ticket events per station with chef attribution.
    - **Super Admin Platform Panel**: Cross-tenant administration for platform stats, tenant/user management, impersonation, and audit logs.

### Navigation Architecture
- Sidebar navigation consolidated into 22 items grouped under 7 hub pages: Promotions, Inventory, Staff & Workforce, Reports & Analytics, Delivery & Online, Locations, and Settings. Old standalone routes redirect to their respective hub pages.

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
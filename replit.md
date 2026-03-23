# Table Salt - Restaurant Management System

## Overview
Table Salt is a multi-tenant SaaS Restaurant Management System designed to streamline restaurant operations. It offers role-based dashboards and a comprehensive suite of features including Point of Sale (POS), Kitchen Display System (KDS), menu, table, and inventory management, staff scheduling, offers, discounts, a dine-in payment flow, and advanced reporting. The system's purpose is to enhance efficiency, reduce operational costs, and improve customer satisfaction for restaurants, supporting scalability and a rich feature set to "Season Your Restaurant Success."

    - **In-App Support Ticket System (Task #125)**: Floating support widget (SupportWidget) visible to owner/manager roles in the bottom-right corner. Widget allows creating support tickets (subject, description, category, priority), viewing ticket history with real-time reply notifications via WebSocket (`support:new_reply`). Admin support console at `/admin/support` with ticket list, filtering, stats. Admin ticket detail at `/admin/support/:ticketId` with reply functionality, status management, tenant context, and impersonation ("View as Owner") capability. DB: `in_app_support_tickets` + `in_app_support_ticket_replies` tables.

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
    - **CRM Integration at POS Checkout**: Customer profile card embedded in BillPreviewModal's preview step. Cashier can look up a customer by phone number; displays name, loyalty tier, visit count, lifetime spend, and tags. Birthday/anniversary auto-suggest banner appears when today matches the customer's stored date. Quick note input with Save button writes directly to CRM. Post-payment: automatically increments visitCount, updates lastVisitAt, and adds to totalSpent via PATCH /api/customers/:id. Works for both regular (payBillMutation) and Razorpay gateway (polling) payment paths. Receipt step shows CRM summary with points earned and updated visit count.
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
    - **KOT & Bill Printing Infrastructure (Task #68)**: `printJobs` table for queuing KOT/bill/receipt print jobs per tenant. KDS kitchen.tsx has a "Reprint KOT" button on each ticket card (prints 80mm monospace layout via `window.open` popup). Station Printer Settings dialog accessible from KDS toolbar (owner/manager only) to configure per-station `printerUrl`. Print Queue Panel embedded in Settings → General tab showing all print jobs with status filter (queued/printed/failed), manual print & skip actions. Bill prints log a job to the queue on print click. `renderKotHtml`/`renderBillHtml`/`printHtmlInPopup` utilities in `client/src/lib/print-utils.ts`.
    - **Super Admin Platform Panel**: Cross-tenant administration for platform stats, tenant/user management, impersonation, and audit logs.
    - **Smart Chef Assignment & Counter Management (Task #76)**: Full kitchen counter management with intelligent chef assignment engine. DB tables: `kitchen_counters`, `chef_roster`, `chef_availability`, `ticket_assignments`. Assignment modes: Full Auto (roster→workload scoring), Hybrid (auto with manual override), Self Assign (chefs claim tickets), Manual (manager-only). Service: `server/services/chef-assignment.ts` with scoring algorithm, auto-assign, self-assign, reassign, workload rebalancing, escalation cron every 60s. API router: `server/routers/kitchen-assignment.ts`. Pages: `/kitchen-settings` (3 tabs: Counters, Roster, Assignment Rules) and `/kitchen-board` (live manager grid with analytics toggle). Chef tablet (kitchen.tsx) updated with "My Tickets" panel, Available Pool, Check-In button. KDS Wall updated with chef assignment badge (assigned chef name / pulsing "Unassigned" indicator) and `?counters=1` mode for counter-column layout. WS events: `chef-assignment:updated`, `chef-availability:changed`, `counter:updated`, `chef-assignment:escalation`, `chef-assignment:rebalanced`.

    - **Phone/Advance Order Entry (Task #96)**: New page `/phone-order` for staff to manually enter orders from phone calls. Features: CRM lookup by phone number, auto-fill customer name, repeat last order, order types (Takeaway/Delivery/Advance/Dine-in), menu item search, qty management, delivery address capture, scheduled date/time for advance orders, special instructions and allergies fields. Advance orders set `status='on_hold'` and auto-release 30 min before scheduled time.
    - **Enhanced Delivery Coordination Panel (Task #96)**: Delivery page at `/delivery` upgraded from list-only to 3-column Kanban view (Preparing / Ready to Go / Out for Delivery). Live KPI bar at top (orders preparing, ready, out, delivered today, avg delivery time). Delivery agent management modal with available/busy/offline status. ASSIGN AGENT button triggers `PATCH /api/delivery-orders/:id/assign-agent`. Platform icons (Zomato🔴/Swiggy🟠/In-house🔵/Phone📞). List view toggle preserved.
    - **Advance Order Auto-Release Scheduler (Task #96)**: `server/services/advance-order-scheduler.ts` — runs every 5 minutes, queries `on_hold` orders with `[ADVANCE]` in notes and `estimatedReadyAt <= NOW() + 30min`, changes them to `new`, emits `coordination:order_updated` + `kitchen:new_order` WebSocket events.
    - **Webhook Stubs (Task #96)**: Placeholder endpoints `POST /api/webhooks/zomato`, `POST /api/webhooks/swiggy`, `POST /api/webhooks/ubereats` — validate Bearer token header, log payload, return `{ received: true }`.
    - **Phone Orders API (Task #96)**: `POST /api/phone-orders` — creates order + order items + delivery_order record, emits WebSocket events for coordination and kitchen.
    - **Selective Item Cooking Control — Backend (Task #108)**: Per-item cooking lifecycle for KDS. New columns on `order_items`: `cooking_status` (7-state: queued/hold/ready_to_start/started/almost_ready/ready/held_warm/served), `suggested_start_at`, `actual_start_at`, `estimated_ready_at`, `actual_ready_at`, `item_prep_minutes`, `started_by_id/name`, `hold_reason`, `hold_until_item_id`, `hold_until_minutes`, `course_number`. New tables: `order_courses` (course-based firing), `kitchen_settings` (per-tenant mode config). Timing engine at `server/services/cooking-timer.ts` computes staggered start times so all dishes finish together. 9 new API endpoints: `PUT /api/kds/items/:id/start|hold|ready|rush`, `POST /api/kds/orders/:id/timing`, `GET /api/kds/orders/:id/item-status`, `POST /api/orders/:id/courses`, `PUT /api/orders/:id/courses/:num/fire`, `GET /api/kds/coordinator/live`, `GET|PUT /api/kitchen-settings`. Auto-start trigger on `sent_to_kitchen` status: selective mode → calculate timing, auto-hold bar items; WebSocket events: `kds:item_started`, `kds:item_held`, `kds:item_ready`, `kds:order_rushed`, `kds:course_fired`, `kds:hold_released`, `kds:order_arrived`. Hold-release engine fires on `kds:item_ready`.

### Navigation Architecture
- Sidebar navigation consolidated into 25 items including Kitchen Board (LayoutGrid, m-35), Kitchen Settings (ChefHat, m-36), Stock Capacity (ClipboardList, m-37), and Phone Orders (Phone, m-38). Grouped under 7 hub pages: Promotions, Inventory, Staff & Workforce, Reports & Analytics, Delivery & Online, Locations, and Settings.

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
# Phase 1 — Background Jobs Inventory

**Total recurring jobs:** 20
**Trigger mechanisms:** setInterval (15), node-cron (3), setTimeout (1), per-request sampling (1)
**All started from:** `server/index.ts` (async IIFE at startup)

---

## Job Registry

| # | Name | File | Line(s) | Mechanism | Interval | Purpose |
|---|------|------|---------|-----------|----------|---------|
| 1 | Webhook Monitor | server/index.ts | 283-390 | setInterval | 30 min | Detects stalled aggregator webhooks; alerts managers during outlet open hours |
| 2 | Reservation Reminders | server/services/reservation-reminders.ts | (imported at index.ts:384) | setInterval | 15 min | Sends 24h and 2h email reminders for confirmed/pending reservations |
| 3 | Retention Cleanup | server/retention-cleanup.ts | 290-323 | setInterval | 30 min | Purges soft-deleted records >30 days, archives audit trail >12 months, cleans report cache, auto-acks alerts |
| 4 | Health Logger | server/routers/compliance.ts | 1113-1139 | setInterval | 5 min | Logs DB response time, memory, uptime to system_health_log |
| 5 | Table Request Escalation | server/routers/table-requests.ts | 787-823 | setInterval | 60 sec | Escalates unresolved table requests by priority threshold |
| 6 | QR Session Cleanup | server/routers/table-requests.ts | 826-835 | Startup (one-time) | Once | Marks expired QR sessions as inactive |
| 7 | Chef Assignment Escalation | server/services/chef-assignment.ts | 572-600 | setInterval | 60 sec | Alerts on unassigned tickets past timeout (default 3 min) |
| 8 | Coordination Rules Checker | server/services/coordination-rules.ts | 354-371 | setInterval | 60 sec | Evaluates order age, stuck items, VIP delays, kitchen overload rules |
| 9 | Advance Order Scheduler | server/services/advance-order-scheduler.ts | 60-71 | setInterval | 5 min | Releases held advance orders 30 min before scheduled time |
| 10 | Prep Deadline Checker | server/services/prep-deadline-checker.ts | 11-215 | setInterval | 60 sec (deadlines) + 1 hr (summary) | Warns at 30/15 min before deadline; hourly readiness summary |
| 11 | Stock Report Scheduler | server/services/stock-report-scheduler.ts | 45-63 | node-cron | Daily 23:00 UTC | Generates nightly stock capacity reports for all tenants |
| 12 | Wastage Summary Scheduler | server/services/wastage-summary-scheduler.ts | 7-31 | node-cron | Daily 00:00 UTC | Daily wastage aggregate per tenant/outlet |
| 13 | Daily Owner Report | server/services/daily-report-scheduler.ts | 70-77 | node-cron | Daily 08:00 UTC | Sends revenue/order/low-stock summary email to owners |
| 14 | Shift Digest Mailer | server/services/shift-digest-mailer.ts | 237-292 | setInterval | 60 sec (checks if shift end hour) | End-of-shift prep digest email to owners/managers/chefs |
| 15 | Trial Warning Mailer | server/services/trial-warning-mailer.ts | 81-91 | setInterval | 1 hour | Sends D-7, D-3, D-1 trial/subscription expiry emails |
| 16 | Unclocked-In Staff Checker | server/services/alert-engine.ts | 139-189 | setInterval | 15 min | Alerts on staff not clocked in 15+ min after shift start |
| 17 | Alert Engine Repeat Timer | server/services/alert-engine.ts | 104-126 | setTimeout (per-alert) | Configurable per definition | Re-triggers unacknowledged alerts per repeat_interval_sec |
| 18 | WebSocket Heartbeat Sweep | server/realtime.ts | 261-298 | setInterval | 30 sec | Pings all WS clients; terminates non-responsive after 10s |
| 19 | WS Connection Logger | server/realtime.ts | 301-309 | setInterval | 5 min | Logs active WS connection count |
| 20 | Printer Monitor | server/services/printer-service.ts | 787-802 | setInterval (per outlet) | Dynamic | Pings printers; retries on failure |

### Also started at server/index.ts (not recurring jobs, but notable startup tasks):
- Inline SQL migrations (ALTER TABLE, CREATE INDEX, ADD ENUM VALUES) — lines 396-460
- Named migration runners (AdminMigrations, Task108, Task184, Task191, P3Deploy, ChefAssignment) — lines 412-434
- Database seeding (10 seed functions) — lines 464-532
- Stripe schema migration + managed webhook setup + price discovery — lines 534-568
- Audit trail startup assertion — lines 576-586
- `clearLoginFailures('superadmin')` — line 462

---

## API Rate Anomaly Sampler (not a job, but security-relevant)
- **File:** server/index.ts:225-231
- **Trigger:** Every authenticated GET request to /api/*
- **Function:** `checkApiRateAnomaly()` — non-blocking, fire-and-forget
- **Purpose:** Detects anomalous API access patterns per user

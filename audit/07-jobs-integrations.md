# Phase 7 — Background Jobs, Queues, and External Integrations

**Date:** 2026-04-15
**Scope:** All 13 background jobs, Stripe, Razorpay, SMTP, SMS, Web Push, aggregator webhooks, Redis, S3, cache, circuit breakers.

---

## 1. Background Jobs — Architecture Overview

**Every job runs in-process** using `setInterval` / `node-cron` / `setTimeout`. There is:
- No distributed job queue (no pg-boss, BullMQ, etc.)
- No leader election
- No advisory locks on any scheduler (exception: `wastage.ts` summary query uses `pg_advisory_xact_lock`)
- No overlap prevention (no running flag)

**If Railway scales to 2+ instances, every job runs on every instance independently.**

### Job-by-Job Audit

| # | Job | File | Interval | Scope | Idempotent? | Multi-Instance Safe? | Overlap Guard? |
|---|-----|------|----------|-------|-------------|---------------------|----------------|
| 1 | Retention Cleanup | `retention-cleanup.ts` | 30 min | Global | Mostly (archive uses ON CONFLICT DO NOTHING; manual-pending digest is NOT idempotent) | **No** | **No** |
| 2 | Advance Order Release | `advance-order-scheduler.ts` | 5 min | Global | Yes (WHERE status='on_hold') | **No** (duplicate WS events) | **No** |
| 3 | Coordination Rules | `coordination-rules.ts` | 60 sec | Global (LIMIT 100 tenants!) | Partial (in-memory 2hr dedup) | **No** (duplicate service_messages inserts) | **No** |
| 4 | Chef Escalation | `chef-assignment.ts` | 60 sec | Global | **No** (re-emits every tick for same tickets) | **No** (duplicate WS events) | **No** |
| 5 | Prep Deadline | `prep-deadline-checker.ts` | 60 sec / 2 hr | Global | Partial (in-memory warnedKeys + DB overdue_alerted flag) | **No** (warnedKeys per-instance) | **No** |
| 6 | Stock Reports | `stock-report-scheduler.ts` | Daily 23:00 | Global | Unknown (depends on generateAndSaveReport) | **No** | **No** |
| 7 | Wastage Summary | `wastage-summary-scheduler.ts` | Daily 00:00 | Global | Yes (pg_advisory_xact_lock) | **Partial** (advisory lock serializes) | **No** |
| 8 | Daily Owner Report | `daily-report-scheduler.ts` | Daily 08:00 | Global | **No** (sends new email each time) | **No** (duplicate emails!) | **No** |
| 9 | Shift Digest | `shift-digest-mailer.ts` | 60 sec | Global (timezone-aware) | In-memory firedKeys (per-instance) | **No** (duplicate emails!) | **No** |
| 10 | Trial Warning | `trial-warning-mailer.ts` | 1 hr | Global | **Yes** (DB-level sent flags) | **Yes** (best in class) | N/A |
| 11 | Unclocked-In Staff | `alert-engine.ts` | 15 min | Global | In-memory firedKeys (per-instance) | **No** (duplicate alert_events) | **No** |
| 12 | Health Logger | `compliance.ts` | 5 min | Server-level | No (additive, not harmful) | Redundant but safe | N/A |
| 13 | Table Request Escalation | `table-requests.ts` | 60 sec | Global | Yes (WHERE escalated_at IS NULL) | Mostly (duplicate WS, DB safe) | **No** |

### Critical Architecture Gap: No Distributed Coordination

Impact in multi-instance deployment:

| Impact | Affected Jobs | Consequence |
|--------|--------------|-------------|
| **Duplicate emails** | Daily Report (#8), Shift Digest (#9) | Every owner/manager receives 2x emails daily |
| **Duplicate DB inserts** | Coordination Rules (#3), Unclocked-In (#11), Retention digest | Spurious alert_events and service_messages rows |
| **Duplicate WS events** | Advance Orders (#2), Chef Escalation (#4), Prep Deadline (#5), Table Escalation (#13) | UI flicker, repeated notifications |
| **Safe (DB-level dedup)** | Trial Warning (#10), Wastage Summary (#7), Table Escalation DB state (#13) | Correct behavior |

### Coordination Rules Tenant Cap

`coordination-rules.ts:26` — `SELECT DISTINCT tenant_id FROM tenants WHERE active = true LIMIT 100`. No `ORDER BY`. Tenants beyond 100 get **zero** coordination rule enforcement. The excluded tenants are nondeterministic.

### In-Memory State Leaks

| State | File | Growth | Cleanup |
|-------|------|--------|---------|
| `firedAlerts` Map | coordination-rules.ts:7 | Per order + rule, 2hr TTL | Lazy (checked on access) — stale keys for completed orders leak |
| `warnedKeys` Set | prep-deadline-checker.ts:8 | Per task | Only cleaned for completed/verified tasks — cancelled tasks leak |
| `firedKeys` Set | shift-digest-mailer.ts:235 | Per tenant+outlet+date | **Never cleaned** — grows forever |
| `firedKeys` Set | alert-engine.ts:141 | Per staff+date | **Never cleaned** |

### SQL Injection in Scheduler

`chef-assignment.ts:585`: `INTERVAL '${settings.unassignedTimeoutMin} minutes'` — value from JSONB in `outlets.assignment_settings` (tenant-writable). Not parameterized. Confirmed in Phase 3 as F-093 — this phase confirms the value is read from user-controlled DB content within a background scheduler that runs every 60 seconds across all tenants.

---

## 2. External Integrations

### 2.1 Stripe

| Aspect | Implementation | Assessment |
|--------|---------------|------------|
| Client init | `server/stripeClient.ts` — Stripe SDK v20, API version 2025-02-24.acacia | Current |
| Subscription checkout | `server/routers/billing.ts` — `stripe.checkout.sessions.create()` with price IDs | Good |
| Webhook verification | Stripe SDK `constructEvent()` — timing-safe | **Good** |
| Webhook events handled | `checkout.session.completed`, `customer.subscription.*`, `invoice.*` | Comprehensive |
| Idempotency | `stripe-replit-sync` has its own event processing pipeline | Redundant system |
| Amount reconciliation | **None** — order payments marked complete without comparing gateway amount to local total | **Gap** (F-105) |
| `stripe-replit-sync` | Creates `stripe.*` schema tables, registers managed webhook, syncs backfill | Replit-specific — redundant on Railway |
| Webhook secret storage | `process.env.STRIPE_WEBHOOK_SECRET` | Good |

### 2.2 Razorpay

| Aspect | Implementation | Assessment |
|--------|---------------|------------|
| Payment links | `server/razorpay.ts` — custom REST client, no SDK | Adequate |
| Signature verification | `expected === signature` (non-constant-time) | **Vulnerable** (F-045) |
| Webhook events | `payment_link.paid` only | Limited |
| Idempotency | Checks `bill.paymentStatus !== "paid"` — TOCTOU race | **Gap** (F-044) |
| Amount reconciliation | **None** — gateway amount accepted without local comparison | **Gap** (F-103) |
| Per-tenant credentials | Falls back from tenant → env vars | Good design |
| Webhook secret | **Global** `RAZORPAY_WEBHOOK_SECRET` shared across all tenants | **Gap** (F-050) |
| Minor-unit conversion | `Math.round(amount * 100)` — assumes centesimal | **Bug** for JPY/KRW (F-106) |

### 2.3 Email / SMTP

| Aspect | Implementation | Assessment |
|--------|---------------|------------|
| Library | nodemailer | Standard |
| Config | `server/email.ts` (password reset, contact) + `server/services/email-service.ts` (transactional) | **Two separate transporter factories** — code duplication |
| Connection pooling | **None** — new transport per `email-service.ts` send | **Gap** (F-181) |
| Error handling | `try/catch` that logs and returns `false` — **all failures silent** | **Gap** (F-182) |
| Retry | **None** — failed sends are permanently lost | **Gap** |
| PII in emails | Temp passwords in body (F-183), customer names/phones in receipts | Acceptable for receipts; passwords in email are high risk |
| Rate limiting | **None** — no per-tenant or global email send cap | Gap |
| TLS | SMTP_SECURE env var; defaults to false for port 587 (STARTTLS) | Acceptable |

**Email types sent:** Welcome, staff invite (with password), password reset, daily report, shift digest, trial warning, reservation reminders, support replies, receipt emails.

### 2.4 SMS (Twilio + MSG91)

| Aspect | Implementation | Assessment |
|--------|---------------|------------|
| Provider routing | India phones (+91 or 10-digit) → MSG91; others → Twilio | Good design |
| Phone cleaning | `/[^+d]/g` — **regex bug**: strips digits instead of non-digits (should be `/[^+\d]/g`) | **Bug** (F-184) |
| SMS logging | INSERT into `sms_log` with `(,,,,,,)` — **no $1-$7 params** — always fails | **Bug** (F-186) |
| Rate limiting | **None** — no per-tenant, per-phone, or time-window limit | **Gap** (F-187) |
| PII | Full phone + message content stored unencrypted (if logging worked) | **Gap** (F-185) |
| Error handling | Silent catch — failures swallowed | Gap |

**Assessment:** SMS integration is likely non-functional. The regex bug corrupts phone numbers, and the logging SQL always fails. Both errors are silently swallowed.

### 2.5 Web Push (VAPID)

| Aspect | Implementation | Assessment |
|--------|---------------|------------|
| VAPID keys | Env vars → fallback: auto-generated and stored in `platform_settings_kv` | Good |
| Subscriptions | Stored in `push_subscriptions` table per user per tenant | Good |
| 410/404 cleanup | Stale subscriptions auto-deleted | Good |
| Rate limiting | **None** — `sendPushToTenant()` fires all pushes in parallel | Low risk |
| Concurrency | No limit on parallel push sends | (F-188) — low risk for typical usage |

### 2.6 Aggregator Webhooks (Zomato/Swiggy/UberEats/Talabat)

| Aspect | Implementation | Assessment |
|--------|---------------|------------|
| Endpoint | `POST /api/aggregator/webhook/:platform` at `channels.ts:179` | |
| Auth | HMAC signature headers read but **NEVER validated** | **Critical** (F-189) |
| Tenant routing | `WHERE slug = :platform AND active = true LIMIT 1` | **Only one tenant per platform** (F-190) |
| CSRF | Exempted at security.ts:208 | Correct for webhooks |
| Adapters | `aggregator-adapters.ts` — Talabat, Swiggy, Zomato, UberEats | |
| Order creation | Creates `aggregator_orders` + full `orders` + `order_items` | Complex |
| Error handling | try/catch, returns 500 | Adequate |
| Stub endpoints | `service-coordination.ts:734,750,766` — hardcoded tokens ("zomato-webhook-token") | Academic (not the production path) |

---

## 3. Redis Usage

| Use Case | File | Fallback When Redis Down | Assessment |
|----------|------|-------------------------|------------|
| WebSocket pub/sub | `pubsub.ts` | In-process EventEmitter (buggy `psubscribe`) | Works single-instance only; `psubscribe` broken locally |
| Rate limiting | `security.ts:97-116` | In-memory store (per-instance) | Rate limits not enforced across instances |
| No other uses | — | — | Redis is optional infrastructure |

**Key gaps:**
- No Redis key prefix — environment collision risk if sharing Redis instance
- `isRedisEnabled()` checks env var existence, not connection health — if Redis dies after startup, messages silently dropped
- No Redis connection retry / reconnect monitoring

---

## 4. S3 / File Storage

| Aspect | Implementation | Assessment |
|--------|---------------|------------|
| S3 key format | `uploads/{UUID}/{filename}` | **No tenant prefix** (F-094) |
| Signed URLs | **None** — permanent public URLs returned | **Gap** — files accessible to anyone with URL |
| File type validation | Image: MIME + extension check; Video: MIME only; Ad: allows `text/html` | **XSS risk** via HTML creative (new finding) |
| File size | Image 5MB, Video 50MB, Ad creative has 50MB buffer limit with secondary 2MB/512KB check | Memory exhaustion vector for ads |
| Virus scanning | **None** | Gap |
| Local fallback | `./uploads/` directory, no cleanup | Files accumulate |
| `deleteFile()` | Accepts arbitrary URL, no tenant auth check | **Gap** (F-094) |

---

## 5. Circuit Breakers

**File:** `server/lib/circuit-breaker.ts`

| Aspect | Implementation | Assessment |
|--------|---------------|------------|
| Circuits | orders, billing, kitchen, reports, inventory-mutations | Correct coverage |
| State | In-memory per instance | Not shared across instances |
| Failure threshold | 1 failure trips the breaker | **Too aggressive** — no minimum sample size |
| Recovery | 30-second half-open window, then auto-close on next success | Standard |
| Manual reset | `POST /api/admin/circuit-breakers/reset` | **Unauthenticated** at index.ts:212 (F-131) |
| Alert on trip | Emits `circuit_breaker:open` WS event + inserts system_event | Good |

---

## 6. Menu Cache

**File:** `server/lib/menu-cache.ts`

| Aspect | Implementation | Assessment |
|--------|---------------|------------|
| Type | In-memory `Map<string, { items, expiresAt }>` | Not shared across instances |
| TTL | 5 minutes | Adequate |
| Key | `outletId` (UUID) | No cross-tenant collision |
| Invalidation | `invalidateByTenant()` — **broken** (looks for `tenantId:` prefix but keys are plain outletId) | **Bug** (F-100) |
| Stampede protection | **None** — concurrent cache misses all hit DB | Gap |
| Cross-instance | Each instance has its own cache — stale data served for up to 5 min after invalidation on another instance | Gap |

---

## Summary of New Findings

Phase 7 adds findings across background jobs (from first agent) and integrations (already in FINDINGS.md as F-180-F-190). The background job findings need to be appended.
